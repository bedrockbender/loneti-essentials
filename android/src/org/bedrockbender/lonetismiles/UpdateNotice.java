package org.bedrockbender.lonetismiles;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** An in-flow notice. Only the small public release manifest is fetched automatically. */
final class UpdateNotice extends LinearLayout implements SharedPreferences.OnSharedPreferenceChangeListener {
    private static final String MANIFEST = "https://bedrockbender.github.io/loneti-essentials/android/latest.json";
    private static final String DOWNLOAD = "https://github.com/bedrockbender/loneti-essentials/releases/download/android-v";
    private final SharedPreferences prefs;
    private final int installedCode;
    private final TextView label;
    private final Button download;
    private final Button close;

    UpdateNotice(Context context) {
        super(context);
        prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE);
        try {
            installedCode = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException impossible) {
            throw new IllegalStateException(impossible);
        }
        setGravity(Gravity.CENTER_VERTICAL);
        int padding = Math.round(8 * getResources().getDisplayMetrics().density);
        setPadding(padding, 0, 0, 0);
        setBackgroundColor(Color.rgb(232, 243, 242));
        setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        label = new TextView(context);
        label.setTextColor(Color.rgb(24, 56, 61));
        addView(label, new LayoutParams(0, -2, 1));
        download = new Button(context, null, android.R.attr.borderlessButtonStyle);
        download.setText(R.string.download_update);
        download.setAllCaps(false);
        addView(download, -2, -2);
        close = new Button(context, null, android.R.attr.borderlessButtonStyle);
        close.setText("×");
        close.setTextSize(22);
        close.setContentDescription(context.getString(R.string.dismiss_update));
        int target = Math.round(48 * getResources().getDisplayMetrics().density);
        addView(close, target, -2);
        setVisibility(GONE);
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        prefs.registerOnSharedPreferenceChangeListener(this);
        render();
    }

    @Override protected void onDetachedFromWindow() {
        prefs.unregisterOnSharedPreferenceChangeListener(this);
        super.onDetachedFromWindow();
    }

    @Override public void onSharedPreferenceChanged(SharedPreferences preferences, String key) {
        if ("code".equals(key) || "version".equals(key) || "dismissed".equals(key)) render();
    }

    private void render() {
        int code = prefs.getInt("code", 0);
        String version = prefs.getString("version", "");
        if (code <= installedCode || code <= prefs.getInt("dismissed", 0) || version.isEmpty()) {
            setVisibility(GONE);
            return;
        }
        label.setText(getContext().getString(R.string.available_update, version));
        download.setOnClickListener(v -> {
            Uri apk = Uri.parse(DOWNLOAD + version + "/Loneti-essentials.apk");
            try {
                getContext().startActivity(new Intent(Intent.ACTION_VIEW, apk).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (ActivityNotFoundException unavailable) {
                Toast.makeText(getContext(), R.string.no_browser, Toast.LENGTH_SHORT).show();
            }
        });
        close.setOnClickListener(v -> prefs.edit().putInt("dismissed", code).apply());
        setVisibility(VISIBLE);
    }

    void check() {
        long now = System.currentTimeMillis();
        long next = prefs.getLong("nextCheck", 0);
        long day = TimeUnit.DAYS.toMillis(1);
        if (next > now && next - now <= day) return;
        prefs.edit().putLong("nextCheck", now + TimeUnit.MINUTES.toMillis(15)).apply();
        // The request may outlive this Activity. All surviving notices observe the same preferences.
        SharedPreferences updates = prefs;
        new Thread(() -> fetch(updates), "loneti-update-check").start();
    }

    private static void fetch(SharedPreferences updates) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(MANIFEST).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            if (connection.getResponseCode() != 200) return;
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                byte[] chunk = new byte[1024];
                for (int count; (count = input.read(chunk)) != -1;) {
                    if (body.size() + count > 4096) return;
                    body.write(chunk, 0, count);
                }
                JSONObject release = new JSONObject(new String(body.toByteArray(), StandardCharsets.UTF_8));
                Object code = release.get("versionCode");
                String version = release.getString("versionName");
                if (!(code instanceof Integer) || (int) code < 1 || !version.matches("[0-9]{1,8}(\\.[0-9]{1,8}){2}")) return;
                updates.edit().putInt("code", (int) code).putString("version", version)
                        .putLong("nextCheck", System.currentTimeMillis() + TimeUnit.DAYS.toMillis(1)).apply();
            }
        } catch (IOException | JSONException ignored) {
            // Offline or incomplete metadata can be retried on a later foreground visit.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
