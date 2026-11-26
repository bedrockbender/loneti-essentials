package test.loneti.smoke;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.PatternMatcher;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
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
            awaitText("Try again");
            click("Язык / Language");
            click("Русский");
            awaitText("Попробовать снова");
            shell("am force-stop " + target);
            shell("am start -W -n " + launchName);
            awaitText("Попробовать снова");
            return;
        }
        if ("true".equals(arguments.getString("public_screens"))) {
            capturePublicScreens(context, launch);
            return;
        }
        int installedCode = context.getPackageManager().getPackageInfo(target, 0).versionCode;
        UpdateFixture.serve(installedCode + 1, "2.3.1");
        Activity activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        SmokeSite[] fixtureSite = new SmokeSite[1];
        WebView[] fixtureWeb = new WebView[1];
        runOnMainSync(() -> {
            WebView web = findWebView(activity.getWindow().getDecorView());
            require(web != null, "Launcher has no WebView");
            FrameLayout viewport = (FrameLayout) web.getParent();
            require(viewport.getChildCount() == 2 && viewport.getChildAt(0) == web,
                    "The content frame should contain the WebView and offline overlay only");
            for (int i = 0; i < viewport.getChildCount(); i++) {
                ViewGroup.LayoutParams size = viewport.getChildAt(i).getLayoutParams();
                require(size.width == ViewGroup.LayoutParams.MATCH_PARENT
                        && size.height == ViewGroup.LayoutParams.MATCH_PARENT,
                        "The WebView and offline overlay should both fill the content frame");
            }
            fixtureWeb[0] = web;
            web.stopLoading();
            SmokeSite site = new SmokeSite(web.getWebViewClient());
            fixtureSite[0] = site;
            web.setWebViewClient(site);
            web.loadUrl(SmokeSite.START);
        });
        awaitText("Local LONETI smoke fixture");
        awaitText("Update 2.3.1 is available");
        ViewGroup screen = (ViewGroup) ((ViewGroup) fixtureWeb[0].getParent()).getParent();
        runOnMainSync(() -> require(screen.getChildAt(0).getBottom() <= screen.getChildAt(1).getTop(),
                "Update notice covers web content"));
        screenshot("fixture-update");
        IntentFilter download = new IntentFilter(Intent.ACTION_VIEW);
        download.addCategory(Intent.CATEGORY_BROWSABLE);
        download.addDataScheme("https");
        download.addDataAuthority("github.com", null);
        download.addDataPath("/bedrockbender/loneti-essentials/releases/download/android-v2.3.1/Loneti-essentials.apk",
                PatternMatcher.PATTERN_LITERAL);
        ActivityMonitor monitor = addMonitor(download, new ActivityResult(Activity.RESULT_CANCELED, null), true);
        click("Download");
        require(checkMonitorHit(monitor, 1), "Download did not target the versioned APK");
        click("Dismiss this update");
        SharedPreferences updates = context.getSharedPreferences("updates", Context.MODE_PRIVATE);
        require(updates.getInt("dismissed", 0) == installedCode + 1, "Dismissal did not survive in preferences");
        awaitGone("Update 2.3.1 is available");
        updates.edit().putInt("code", installedCode + 2).putString("version", "2.3.2").apply();
        awaitText("Update 2.3.2 is available");
        updates.edit().putInt("code", installedCode).apply();
        awaitGone("Update 2.3.2 is available");
        require(find("Язык / Language", 500) == null, "Language selector outside the closed menu");
        click("Account menu");
        click("Язык / Language");
        awaitText("System default");
        awaitText("Русский");
        screenshot("fixture-language");
        automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
        awaitWebViewFeatures(fixtureWeb[0]);
        click("Open smoke editor");
        awaitText("Open smoke drawing");
        awaitJs(fixtureWeb[0], "window.fixtureHookAtHead===true"
                + "&&window.fixtureObserverRemoved===true"
                + "&&document.querySelector('iframe')?.contentWindow.fixtureFrameClean===true"
                + "&&document.querySelectorAll('.js--container-work-canvas [data-loneti-essentials=tools]').length===1"
                + "&&document.querySelectorAll('#tools > .one_tool[data-tool]').length===4"
                + "&&document.querySelectorAll('#tools button[data-le-tool]').length===3",
                "one early drawing hook, three drawing tools in the native panel, one canvas overlay and no iframe hook");
        dragGradientStop(fixtureWeb[0]);
        runOnMainSync(activity::onBackPressed);
        awaitText("Local LONETI smoke fixture");
        click("Open smoke editor");
        awaitText("Open smoke drawing");
        click("Open smoke drawing");
        click("Add this Smile to My emotes");
        awaitText("Add this Smile?");
        click("Cancel");
        require(fixtureSite[0].saveCount() == 0, "Cancel sent a save");
        click("Add this Smile to My emotes");
        clickWebDialogButton(fixtureWeb[0], "Add to my Smiles");
        awaitText("Added to My emotes");
        click("Close");
        require(fixtureSite[0].saveCount() == 1, "Collector did not save exactly once");
        click("Open direct message");
        click("Add this Smile to My emotes");
        clickWebDialogButton(fixtureWeb[0], "Add to my Smiles");
        awaitText("Already added");
        awaitText("This Smile is already in Unsorted.");
        click("Close");
        require(fixtureSite[0].saveCount() == 1, "Already-owned Smile sent another save");
        click("Open user Wall");
        click("Add this Smile to My emotes");
        clickWebDialogButton(fixtureWeb[0], "Add to my Smiles");
        awaitText("Added to My emotes");
        click("Close");
        require(fixtureSite[0].saveCount() == 2, "Wall post did not save exactly once");
        click("Show replies");
        awaitJs(fixtureWeb[0], "!!document.querySelector('.wall-post__comments img[data-lsc-smile]')",
                "the newly loaded Wall reply");
        fixtureSite[0].rejectNextSave();
        clickLast("Add this Smile to My emotes");
        clickWebDialogButton(fixtureWeb[0], "Add to my Smiles");
        awaitText("Unable to save");
        click("Close");
        require(fixtureSite[0].saveCount() == 2, "Rejected Wall reply changed the library");
        click("Open smoke library");
        awaitText("Unsorted (3)");

        Uri fixture = PackFixture.putInDownloads(context);
        try {
            openPack(PackFixture.FILE_NAME);
            clickWebDialogButton(fixtureWeb[0], "Preview pack");
            awaitText(PackFixture.NAME);
            click("Install pack");
            awaitText("Added: 1. Already in My emotes: 0.");
            click("Close");
            awaitText(PackFixture.NAME + " (1)");
            require(fixtureSite[0].saveCount() == 3, "Expected two collector saves and one pack save");

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
            clickWebDialogButton(fixtureWeb[0], "Preview pack");
            awaitText(PackFixture.NAME);
            click("Cancel");
            require(fixtureSite[0].saveCount() == 3, "Pack export and preview must not save a Smile");
        } finally {
            context.getContentResolver().delete(fixture, null, null);
        }
    }

    private void screenshot(String name) throws IOException {
        waitForIdleSync();
        Bitmap image = automation.takeScreenshot();
        require(image != null, "Android could not capture " + name);
        File path = new File(getTargetContext().getExternalFilesDir("screenshots"), name + ".png");
        try (FileOutputStream out = new FileOutputStream(path)) {
            require(image.compress(Bitmap.CompressFormat.PNG, 100, out), "Could not write " + name);
        } finally {
            image.recycle();
        }
    }

    // Optional release screenshots use the public signed-out home page. All write tests run offline.
    private void capturePublicScreens(Context context, Intent launch) throws Exception {
        context.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString("language", "ru").commit();
        SharedPreferences updates = context.getSharedPreferences("updates", Context.MODE_PRIVATE);
        updates.edit().clear().putLong("nextCheck", System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1)).commit();
        Activity activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        WebView[] holder = new WebView[1];
        runOnMainSync(() -> holder[0] = findWebView(activity.getWindow().getDecorView()));
        WebView web = holder[0];
        String footerLink = "document.querySelector('#footer a[href=\"loneti-essentials://language\"]')";
        long deadline = SystemClock.uptimeMillis() + 60000;
        while (!"true".equals(evaluate(web, "Boolean(" + footerLink + ")"))) {
            require(SystemClock.uptimeMillis() < deadline, "Could not load the public Russian home page for screenshots");
            tryClick("Попробовать снова", 500);
            SystemClock.sleep(750);
        }
        // A fresh guest session can show LONETI's own cookie notice over the footer.
        tryClick("Хорошо!", 1500);
        screenshot("public-home");
        evaluate(web, footerLink + ".scrollIntoView({block:'center'})");
        awaitText("Язык / Language");
        screenshot("public-language-link");
        click("Язык / Language");
        awaitText("Как на устройстве");
        screenshot("public-language");
        automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
        evaluate(web, "window.scrollTo(0,0)");
        int installed = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        updates.edit().putInt("code", installed + 1).putString("version", "2.3.1").apply();
        awaitText("Доступно обновление 2.3.1");
        screenshot("public-update");
    }

    private void dragGradientStop(WebView web) throws Exception {
        String options = "document.querySelector('#cont_config [data-loneti-essentials=options]').shadowRoot";
        evaluate(web, "(()=>{document.querySelector('#tools button[data-le-tool=gradient]').click();return true;})()");
        awaitJs(web, options + ".querySelector('[data-rail] button').getBoundingClientRect().width>0",
                "the Gradient color stop controls");
        JSONArray geometry = new JSONArray(evaluate(web, "(()=>{const options=" + options
                + ", rail=options.querySelector('[data-rail]'), stop=rail.firstElementChild;"
                + "stop.scrollIntoView({block:'center'});"
                + "stop.addEventListener('pointerdown',event=>{window.fixtureStopPointer=event.pointerType;},{once:true});"
                + "const r=stop.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;"
                + "if(options.elementFromPoint(x,y)!==stop)throw Error('Color stop outside fixture viewport');return [x,y,"
                + "rail.clientWidth*0.40,innerWidth];})()"));
        int[] origin = new int[2];
        int[] width = new int[1];
        runOnMainSync(() -> {
            web.getLocationOnScreen(origin);
            width[0] = web.getWidth();
        });
        float scale = width[0] / (float) geometry.getDouble(3);
        float x = origin[0] + scale * (float) geometry.getDouble(0);
        float y = origin[1] + scale * (float) geometry.getDouble(1);
        float distance = scale * (float) geometry.getDouble(2);
        long start = SystemClock.uptimeMillis();
        injectTouch(start, MotionEvent.ACTION_DOWN, x, y);
        for (int step = 1; step <= 5; step++) {
            SystemClock.sleep(30);
            injectTouch(start, MotionEvent.ACTION_MOVE, x + distance * step / 5, y);
        }
        injectTouch(start, MotionEvent.ACTION_UP, x + distance, y);
        awaitJs(web, "(()=>{const rail=" + options + ".querySelector('[data-rail]');"
                + "const position=parseFloat(rail.firstElementChild.style.left);"
                + "return window.fixtureStopPointer==='touch'&&rail.children.length===2&&position>=33&&position<=47;})()",
                "a touch drag moving the first stop to about 40% without adding a stop");
    }

    private void injectTouch(long start, int action, float x, float y) {
        MotionEvent.PointerProperties finger = new MotionEvent.PointerProperties();
        finger.id = 0;
        finger.toolType = MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords position = new MotionEvent.PointerCoords();
        position.x = x;
        position.y = y;
        position.pressure = action == MotionEvent.ACTION_UP ? 0 : 1;
        position.size = 1;
        MotionEvent event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), action, 1,
                new MotionEvent.PointerProperties[]{finger}, new MotionEvent.PointerCoords[]{position},
                0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        try {
            require(automation.injectInputEvent(event, true), "Could not inject Android touch event " + action);
        } finally {
            event.recycle();
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

    private String evaluate(WebView web, String script) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        require(latch.await(20, TimeUnit.SECONDS), "No WebView callback for " + script.substring(0, Math.min(140, script.length())));
        return result.get();
    }

    private void awaitJs(WebView web, String expression, String description) throws InterruptedException {
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate(web, expression))) return;
            SystemClock.sleep(150);
        }
        throw new AssertionError("Could not verify " + description + "; visible: " + visibleLabels());
    }

    private void clickWebDialogButton(WebView web, String label) throws InterruptedException {
        // The dialog is visible before the WebView finishes reading an image or pack header.
        awaitJs(web, "(()=>{for(const host of document.body.children){"
                + "const dialog=host.shadowRoot?.querySelector('dialog[open]');if(!dialog)continue;"
                + "const button=[...dialog.querySelectorAll('button:not([hidden]):enabled')]"
                + ".find(button=>button.textContent.trim()===" + JSONObject.quote(label) + ");"
                + "if(button){button.click();return true;}}return false;})()", "the ready " + label + " button");
    }

    private void awaitWebViewFeatures(WebView web) throws InterruptedException {
        String result = evaluate(web, "JSON.stringify({abort:typeof AbortController,timeout:typeof AbortSignal.timeout,"
                + "crypto:!!window.crypto?.subtle,locks:!!navigator.locks})");
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

    private void awaitGone(String text) {
        long deadline = SystemClock.uptimeMillis() + 5000;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root != null && scan(root, text) == null) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("UI label remained visible: " + text);
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
