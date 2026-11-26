package test.loneti.smoke;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.view.accessibility.AccessibilityNodeInfo;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class SmokeTest extends Instrumentation {
    private Bundle arguments;
    private UiAutomation automation;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        this.arguments = arguments;
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            runSmoke();
            result.putString("stream", "\nLONETI_ANDROID_SMOKE_OK\n");
            finish(Activity.RESULT_OK, result);
        } catch (Exception | AssertionError failure) {
            result.putString("stream", "\nLONETI_ANDROID_SMOKE_FAILED: " + failure + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void runSmoke() throws Exception {
        Context context = getTargetContext();
        String target = arguments.getString("app_package", "");
        require(target.matches("[A-Za-z][A-Za-z0-9_.]+"), "An app_package argument is required");
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(target);
        require(launch != null && launch.getComponent() != null, "APK has no launcher activity");
        automation = getUiAutomation();
        if ("true".equals(arguments.getString("launch_only"))) {
            String launchName = launch.getComponent().flattenToString();
            String output = shell("am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n " + launchName);
            require(output.contains("Status: ok") && !output.contains("Error:"), "Activity start failed: " + output.trim());
            awaitApp(target);
            awaitText("Smile Collector");
            return;
        }
        Activity activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        SmokeSite[] fixtureSite = new SmokeSite[1];
        WebView[] fixtureWeb = new WebView[1];
        runOnMainSync(() -> {
            WebView web = findWebView(activity.getWindow().getDecorView());
            require(web != null, "Launcher has no WebView");
            fixtureWeb[0] = web;
            web.stopLoading();
            SmokeSite site = new SmokeSite(web.getWebViewClient());
            fixtureSite[0] = site;
            web.setWebViewClient(site);
            web.loadUrl(SmokeSite.START);
        });
        awaitText("Local LONETI smoke fixture");
        awaitWebViewFeatures(fixtureWeb[0]);
        click("Open smoke drawing");
        click("Add this Smile to My emotes");
        awaitText("Add this Smile?");
        click("Cancel");
        require(fixtureSite[0].saveCount() == 0, "Cancel sent a save");
        click("Add this Smile to My emotes");
        click("Add to my Smiles");
        awaitText("Added to My emotes");
        click("Close");
        click("Open smoke library");
        awaitText("Unsorted (2)");

        Uri fixture = PackFixture.putInDownloads(context);
        try {
            openPack(PackFixture.FILE_NAME);
            click("Preview pack");
            awaitText(PackFixture.NAME);
            click("Install pack");
            awaitText("Installed " + PackFixture.NAME + " in My emotes.");
            click("Close");
            awaitText(PackFixture.NAME + " (1)");
            require(fixtureSite[0].saveCount() == 2, "Expected one collector and one pack save");

            exportPack();
            awaitText("Save");
            automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
            awaitText("Android save cancelled.");
            click("Download .lesp");
            chooseDownloadsIfAvailable();
            click("Save");
            awaitText("1 Smile downloaded.");
            click("Close");

            openPack(PackFixture.NAME + ".lesp");
            click("Preview pack");
            awaitText(PackFixture.NAME);
            click("Cancel");
            require(fixtureSite[0].saveCount() == 2, "Pack export and preview must not save a Smile");
        } finally {
            context.getContentResolver().delete(fixture, null, null);
        }
    }

    private void exportPack() {
        click(PackFixture.NAME + " (1)");
        clickLast("Download pack");
        click("Download .lesp");
    }

    private void openPack(String filename) {
        click("Install pack");
        if (!tryClick("Choose File", 3000)) click("Choose a .lesp file");
        if (!tryClick(filename, 4000)) {
            chooseDownloadsIfAvailable();
            click(filename);
        }
    }

    private void chooseDownloadsIfAvailable() {
        if (tryClick("Show roots", 3000)) click("Downloads");
    }

    private void clickLast(String text) {
        long deadline = SystemClock.uptimeMillis() + 20000;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            ArrayList<AccessibilityNodeInfo> matches = new ArrayList<>();
            if (root != null) collectMatches(root, text, matches);
            if (!matches.isEmpty() && activate(matches.get(matches.size() - 1))) return;
            SystemClock.sleep(150);
        }
        throw new AssertionError("Could not click UI label " + text + "; visible: " + visibleLabels());
    }

    private static void collectMatches(AccessibilityNodeInfo node, String text,
            ArrayList<AccessibilityNodeInfo> results) {
        if (node.isVisibleToUser() && (matches(node.getText(), text)
                || matches(node.getContentDescription(), text))) results.add(node);
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) collectMatches(child, text, results);
        }
    }

    private void awaitWebViewFeatures(WebView web) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> features = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript("JSON.stringify({abort:typeof AbortController,timeout:typeof AbortSignal.timeout,"
                + "crypto:!!window.crypto?.subtle,locks:!!navigator.locks})", result -> {
                    features.set(result);
                    latch.countDown();
                }));
        require(latch.await(10, TimeUnit.SECONDS), "WebView did not evaluate fixture capability check");
        String result = features.get();
        require(result != null && result.contains("function") && !result.contains("undefined") && !result.contains("false"),
                "WebView lacks basic abort handling, Web Crypto, or Web Locks: " + result);
    }

    private String visibleLabels() {
        ArrayList<String> labels = new ArrayList<>();
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root != null) appendLabels(root, labels);
        return labels.toString();
    }

    private static void appendLabels(AccessibilityNodeInfo node, ArrayList<String> labels) {
        if (labels.size() >= 24) return;
        CharSequence label = node.getText();
        if (label == null || label.length() == 0) label = node.getContentDescription();
        if (node.isVisibleToUser() && label != null && label.length() > 0) {
            labels.add(label.subSequence(0, Math.min(label.length(), 100)).toString());
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) appendLabels(child, labels);
        }
    }
    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) {
            WebView web = findWebView(group.getChildAt(index));
            if (web != null) return web;
        }
        return null;
    }

    private String shell(String command) throws IOException {
        ParcelFileDescriptor descriptor = automation.executeShellCommand(command);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            byte[] buffer = new byte[4096];
            for (int count; (count = stream.read(buffer)) != -1;) bytes.write(buffer, 0, count);
        }
        return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
    }

    private void awaitApp(String pkg) {
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root != null && root.getPackageName() != null && pkg.contentEquals(root.getPackageName())) return;
            SystemClock.sleep(200);
        }
        throw new AssertionError("Could not verify the launcher screen for " + pkg);
    }

    private AccessibilityNodeInfo find(String expected, long timeout) {
        long deadline = SystemClock.uptimeMillis() + timeout;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            AccessibilityNodeInfo match = root == null ? null : scan(root, expected);
            if (match != null) return match;
            SystemClock.sleep(150);
        }
        return null;
    }

    private static boolean matches(CharSequence text, String expected) {
        return text != null && text.toString().trim().equalsIgnoreCase(expected);
    }

    private static AccessibilityNodeInfo scan(AccessibilityNodeInfo node, String expected) {
        if (node.isVisibleToUser()
                && (matches(node.getText(), expected) || matches(node.getContentDescription(), expected))) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            AccessibilityNodeInfo match = child == null ? null : scan(child, expected);
            if (match != null) return match;
        }
        return null;
    }

    private void awaitText(String text) {
        require(find(text, 20000) != null, "Did not see UI label " + text + "; visible: " + visibleLabels());
    }

    private void click(String text) {
        require(tryClick(text, 20000), "Could not click UI label " + text + "; visible: " + visibleLabels());
    }

    private boolean tryClick(String text, long timeout) {
        AccessibilityNodeInfo match = find(text, timeout);
        return match != null && activate(match);
    }

    private boolean activate(AccessibilityNodeInfo match) {
        AccessibilityNodeInfo node = match;
        while (node != null) {
            if (node.isClickable() && node.isEnabled()
                    && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                SystemClock.sleep(250);
                return true;
            }
            node = node.getParent();
        }
        Rect rect = new Rect();
        match.getBoundsInScreen(rect);
        if (rect.isEmpty()) return false;
        long start = SystemClock.uptimeMillis();
        for (int action : new int[]{MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP}) {
            MotionEvent event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), action,
                    rect.centerX(), rect.centerY(), 0);
            try {
                if (!automation.injectInputEvent(event, true)) return false;
            } finally {
                event.recycle();
            }
        }
        SystemClock.sleep(250);
        return true;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
