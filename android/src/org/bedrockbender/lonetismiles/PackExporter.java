package org.bedrockbender.lonetismiles;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

final class PackExporter {
    private static final int REQUEST_CREATE_PACK = 321;
    private static final String HANDSHAKE = "loneti-smile-pack-export-v1";
    private static final int MAX_BYTES = 16 * 1024 * 1024;
    private static final int CHUNK_BYTES = 32 * 1024;
    private static final int MAX_MESSAGE_LENGTH = ((CHUNK_BYTES + 2) / 3) * 4 + 256;
    private static final long TRANSFER_TIMEOUT_MS = 30_000;
    private static final byte[] PACK_SIGNATURE = {'L', 'E', 'S', 'P', 1};

    private final Activity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor storage = new ThreadPoolExecutor(
            0, 1, 20, TimeUnit.SECONDS, new LinkedBlockingQueue<>());
    private final Runnable timeout = () -> fail("unavailable");

    private WebMessagePort port;
    private Transfer active;
    private Transfer picker;
    private boolean cleaning;

    private static final class Transfer {
        final String id;
        final String filename;
        final int size;
        int received;
        boolean busy;
        volatile boolean cancelled;
        // File and its stream are used only by the storage thread.
        File file;
        OutputStream output;

        Transfer(String id, String filename, int size) {
            this.id = id;
            this.filename = filename;
            this.size = size;
        }
    }

    @FunctionalInterface
    private interface StorageAction {
        void run() throws IOException;
    }

    PackExporter(Activity activity) {
        this.activity = activity;
    }

    void connect(WebView view, String origin) {
        reset();
        if (!"https://loneti.art".equals(origin) && !"https://loneti.ru".equals(origin)) return;
        WebMessagePort[] channel = null;
        try {
            channel = view.createWebMessageChannel();
            port = channel[0];
            port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override
                public void onMessage(WebMessagePort sender, WebMessage message) {
                    if (sender == port) receive(message.getData());
                }
            }, ui);
            view.postWebMessage(new WebMessage(HANDSHAKE, new WebMessagePort[]{channel[1]}), Uri.parse(origin));
        } catch (RuntimeException error) {
            reset();
            if (channel != null) closePort(channel[1]);
        }
    }

    void reset() {
        // Keep a pending picker result tied to its old transfer across navigation.
        releaseActive();
        if (port != null) {
            closePort(port);
            port = null;
        }
    }

    private static void closePort(WebMessagePort current) {
        try {
            current.close();
        } catch (IllegalStateException ignored) {
            // Navigation can invalidate the port before the application closes it.
        }
    }

    private void receive(String data) {
        if (data == null || data.length() > MAX_MESSAGE_LENGTH) {
            fail("invalid");
            return;
        }
        try {
            JSONObject message = new JSONObject(data);
            String id = message.getString("id");
            if (!id.matches("[0-9a-f]{32}")) return;
            String operation = message.getString("type");
            if ("begin".equals(operation)) {
                begin(id, message);
                return;
            }
            if (active == null || !id.equals(active.id)) return;
            if ("abort".equals(operation)) {
                releaseActive();
                return;
            }
            if (active.busy || picker != null) {
                fail("invalid");
                return;
            }
            switch (operation) {
                case "chunk":
                    receiveChunk(active, message);
                    break;
                case "finish":
                    finish(active);
                    break;
                default:
                    fail("invalid");
            }
        } catch (IllegalArgumentException | JSONException error) {
            fail("invalid");
        }
    }

    private void begin(String id, JSONObject message) throws JSONException {
        if (active != null || picker != null || cleaning) {
            send(id, "busy", 0);
            return;
        }
        String filename = message.getString("filename");
        int size = boundedInteger(message, "size");
        if (!safeFilename(filename) || size < 10 || size > MAX_BYTES) {
            send(id, "invalid", 0);
            return;
        }

        Transfer transfer = new Transfer(id, filename, size);
        active = transfer;
        armTimeout();
        runStorage(transfer, () -> {
            transfer.file = File.createTempFile("smile-pack-", ".tmp", activity.getCacheDir());
            transfer.output = new FileOutputStream(transfer.file);
        }, () -> send(id, "ready", 0));
    }

    private static int boundedInteger(JSONObject message, String key) {
        Object value = message.opt(key);
        if (!(value instanceof Integer) && !(value instanceof Long)) return -1;
        long number = ((Number) value).longValue();
        return number >= 0 && number <= MAX_BYTES ? (int) number : -1;
    }

    private static boolean safeFilename(String filename) {
        if (!filename.endsWith(".lesp") || filename.length() <= 5
                || filename.getBytes(StandardCharsets.UTF_8).length > 255) return false;
        String name = filename.substring(0, filename.length() - 5);
        if (name.trim().isEmpty() || name.endsWith(".") || name.endsWith(" ")) return false;
        for (int index = 0; index < name.length(); index++) {
            char character = name.charAt(index);
            if (Character.isISOControl(character) || (character >= 0x202a && character <= 0x202e)
                    || (character >= 0x2066 && character <= 0x2069) || "<>:\"/\\|?*".indexOf(character) >= 0) return false;
        }
        return true;
    }

    private void receiveChunk(Transfer transfer, JSONObject message) throws JSONException {
        int offset = boundedInteger(message, "offset");
        String encoded = message.getString("data");
        int expected = Math.min(CHUNK_BYTES, transfer.size - transfer.received);
        if (offset != transfer.received || expected <= 0 || encoded.length() != ((expected + 2) / 3) * 4) {
            fail("invalid");
            return;
        }
        byte[] chunk = Base64.decode(encoded, Base64.NO_WRAP);
        if (chunk.length != expected || (offset == 0 && !validHeader(chunk, transfer.size))) {
            fail("invalid");
            return;
        }
        runStorage(transfer, () -> transfer.output.write(chunk), () -> {
            transfer.received += chunk.length;
            armTimeout();
            send(transfer.id, "chunk", transfer.received);
        });
    }

    private static boolean validHeader(byte[] chunk, int size) {
        for (int i = 0; i < PACK_SIGNATURE.length; i++) {
            if (chunk[i] != PACK_SIGNATURE[i]) return false;
        }
        int flag = chunk[PACK_SIGNATURE.length];
        return flag == 0 || (flag == 1 && size >= 54);
    }

    private void finish(Transfer transfer) {
        if (transfer.received != transfer.size) {
            fail("invalid");
            return;
        }
        runStorage(transfer, () -> {
            transfer.output.close();
            transfer.output = null;
        }, () -> showPicker(transfer));
    }

    @SuppressWarnings("deprecation")
    private void showPicker(Transfer transfer) {
        ui.removeCallbacks(timeout);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, transfer.filename);
        picker = transfer;
        try {
            activity.startActivityForResult(intent, REQUEST_CREATE_PACK);
            send(transfer.id, "picking", 0);
        } catch (RuntimeException error) {
            picker = null;
            fail("unavailable");
        }
    }

    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CREATE_PACK) return false;
        Transfer transfer = picker;
        picker = null;
        if (transfer == null || transfer != active) return true;
        if (resultCode != Activity.RESULT_OK) {
            fail("cancelled");
            return true;
        }
        Uri destination = data == null ? null : data.getData();
        if (destination == null || !ContentResolver.SCHEME_CONTENT.equals(destination.getScheme())) {
            fail("unavailable");
            return true;
        }
        runStorage(transfer, () -> writeDocument(transfer, destination), () -> {
            send(transfer.id, "saved", transfer.size);
            releaseActive();
        });
        return true;
    }

    private void writeDocument(Transfer transfer, Uri destination) throws IOException {
        if (transfer.cancelled) return;
        try (FileInputStream input = new FileInputStream(transfer.file);
             OutputStream output = activity.getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) throw new IOException("Missing output stream");
            byte[] buffer = new byte[CHUNK_BYTES];
            int total = 0;
            int count;
            while (!transfer.cancelled && (count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                total += count;
            }
            if (total != transfer.size) throw new IOException("Incomplete output");
        }
    }

    private void runStorage(Transfer transfer, StorageAction action, Runnable next) {
        transfer.busy = true;
        storage.execute(() -> {
            try {
                if (transfer.cancelled) return;
                action.run();
                ui.post(() -> {
                    if (active != transfer) return;
                    transfer.busy = false;
                    next.run();
                });
            } catch (IOException | RuntimeException error) {
                ui.post(() -> {
                    if (active == transfer) fail("unavailable");
                });
            }
        });
    }

    private void armTimeout() {
        ui.removeCallbacks(timeout);
        ui.postDelayed(timeout, TRANSFER_TIMEOUT_MS);
    }

    private void fail(String status) {
        if (active == null) return;
        send(active.id, status, 0);
        releaseActive();
    }

    private void releaseActive() {
        ui.removeCallbacks(timeout);
        Transfer transfer = active;
        active = null;
        if (transfer == null) return;
        transfer.cancelled = true;
        cleaning = true;
        storage.execute(() -> {
            try {
                if (transfer.output != null) {
                    try { transfer.output.close(); } catch (IOException ignored) {}
                }
                if (transfer.file != null) transfer.file.delete();
            } finally {
                ui.post(() -> cleaning = false);
            }
        });
    }

    private void send(String id, String status, int offset) {
        if (port == null) return;
        try {
            JSONObject message = new JSONObject();
            message.put("id", id);
            message.put("status", status);
            message.put("offset", offset);
            port.postMessage(new WebMessage(message.toString()));
        } catch (RuntimeException | JSONException error) {
            reset();
        }
    }
}
