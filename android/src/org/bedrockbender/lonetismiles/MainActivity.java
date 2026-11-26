package org.bedrockbender.lonetismiles;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

public final class MainActivity extends Activity {
    private WebView web;
    private LinearLayout errorPane;
    private PackExporter exporter;
    private String bootstrap;
    private String failedUrl;
    private int navigation;
    private int connectedDocument = -1;
    private int pickerCode = 1000;
    private ValueCallback<Uri[]> fileSelection;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        exporter = new PackExporter(this);
        try {
            bootstrap = "(function(){'use strict';"
                    + "if(window!==window.top)return false;"
                    + "if(!['https://loneti.art','https://loneti.ru'].includes(location.origin)"
                    + "||!/^\\/(pict|chat|settings)/.test(location.pathname))return false;"
                    + "if(window.__lonetiCollectorInstalled)return true;"
                    + asset("pack-export.js") + "\n" + asset("collector.user.js")
                    + "\nwindow.__lonetiCollectorInstalled=true;return true;})()";
        } catch (IOException error) {
            throw new IllegalStateException("Missing bundled collector assets", error);
        }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(0xffe8efdf);
        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextColor(0xff294d32);
        title.setPadding(dp(16), 0, 0, 0);
        title.setTextSize(17);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button menu = new Button(this, null, android.R.attr.borderlessButtonStyle);
        menu.setText("⋮");
        menu.setTextSize(24);
        menu.setContentDescription(getString(R.string.more));
        menu.setOnClickListener(this::openMenu);
        bar.addView(menu, dp(52), dp(48));
        root.addView(bar, -1, -2);

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        content.addView(web, -1, -1);
        errorPane = makeErrorPane();
        content.addView(errorPane, -1, -1);
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new SiteClient());
        web.setWebChromeClient(new SiteChrome());
        if (state == null || web.restoreState(state) == null) web.loadUrl(homeOrigin() + "/");
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String asset(String name) throws IOException {
        try (InputStream input = getAssets().open(name);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private String homeOrigin() {
        return Locale.getDefault().getLanguage().equals("ru") ? "https://loneti.ru" : "https://loneti.art";
    }

    // Compare the full authority so credentials, alternate ports and lookalike domains are excluded.
    private static String siteOrigin(Uri uri) {
        String authority = uri.getEncodedAuthority();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || authority == null) return null;
        String host = authority.toLowerCase(Locale.ROOT);
        if (host.endsWith(":443")) host = host.substring(0, host.length() - 4);
        if (host.equals("loneti.art") || host.equals("loneti.ru")) return "https://" + host;
        return null;
    }

    private String currentOrigin() {
        String url = web.getUrl();
        return url == null ? null : siteOrigin(Uri.parse(url));
    }

    private void openMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, R.string.home);
        menu.getMenu().add(0, 2, 1, R.string.library);
        menu.getMenu().add(0, 3, 2, R.string.reload);
        menu.setOnMenuItemClickListener(item -> {
            String origin = currentOrigin();
            if (origin == null) origin = homeOrigin();
            switch (item.getItemId()) {
                case 1: web.loadUrl(origin + "/"); break;
                case 2: web.loadUrl(origin + "/settings?act=smiles"); break;
                default: reload(); break;
            }
            return true;
        });
        menu.show();
    }

    private LinearLayout makeErrorPane() {
        LinearLayout pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        pane.setGravity(Gravity.CENTER);
        pane.setPadding(dp(24), dp(16), dp(24), dp(16));
        pane.setBackgroundColor(Color.WHITE);
        TextView heading = new TextView(this);
        heading.setText(R.string.offline);
        heading.setTextSize(21);
        pane.addView(heading);
        TextView help = new TextView(this);
        help.setText(R.string.connection_help);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, dp(8), 0, dp(12));
        pane.addView(help);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> reload());
        pane.addView(retry);
        pane.setVisibility(View.GONE);
        return pane;
    }

    private void reload() {
        if (failedUrl != null) web.loadUrl(failedUrl);
        else web.reload();
    }

    private final class SiteClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!request.isForMainFrame()) return false;
            if (siteOrigin(uri) != null) return false;
            if ("http".equalsIgnoreCase(uri.getScheme())) {
                Uri secure = uri.buildUpon().scheme("https").build();
                if (siteOrigin(secure) != null) {
                    view.loadUrl(secure.toString());
                    return true;
                }
            }
            if (request.hasGesture() && ("https".equalsIgnoreCase(uri.getScheme())
                    || "http".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (ActivityNotFoundException unavailable) {
                    Toast.makeText(MainActivity.this, R.string.no_browser, Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }

        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            navigation++;
            exporter.reset();
            finishSelection(null);
            failedUrl = null;
            errorPane.setVisibility(View.GONE);
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && siteOrigin(request.getUrl()) != null
                    && error.getErrorCode() != ERROR_UNSUPPORTED_SCHEME) {
                failedUrl = request.getUrl().toString();
                errorPane.setVisibility(View.VISIBLE);
            }
        }

        @Override public void onPageFinished(WebView view, String url) {
            if (failedUrl != null || url == null || !url.equals(view.getUrl())) return;
            Uri uri = Uri.parse(url);
            String origin = siteOrigin(uri);
            String path = uri.getPath();
            if (origin == null || path == null || !(path.startsWith("/pict")
                    || path.startsWith("/chat") || path.startsWith("/settings"))) return;
            int document = navigation;
            view.evaluateJavascript(bootstrap, result -> {
                if (document != navigation || isDestroyed() || !origin.equals(currentOrigin())) return;
                if ("true".equals(result)) {
                    if (connectedDocument != document) {
                        connectedDocument = document;
                        exporter.connect(view, origin);
                    }
                } else if (!"false".equals(result)) {
                    Toast.makeText(MainActivity.this, R.string.update_engine, Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    // WebChromeClient also supplies WebView's standard confirm, prompt and alert dialogs.
    private final class SiteChrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                FileChooserParams params) {
            finishSelection(null);
            if (currentOrigin() == null || failedUrl != null) {
                callback.onReceiveValue(null);
                return true;
            }
            fileSelection = callback;
            pickerCode = pickerCode >= 60000 ? 1000 : pickerCode + 1;
            Intent choose = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
            ArrayList<String> mime = new ArrayList<>();
            boolean allTypes = false;
            for (String entry : params.getAcceptTypes()) {
                for (String type : entry.split(",")) {
                    type = type.trim();
                    if (type.equals(".lesp") || type.equals("*/*")) allTypes = true;
                    else if (type.contains("/")) mime.add(type);
                }
            }
            choose.setType(!allTypes && mime.size() == 1 ? mime.get(0) : "*/*");
            if (!allTypes && mime.size() > 1) choose.putExtra(Intent.EXTRA_MIME_TYPES, mime.toArray(new String[0]));
            choose.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                startActivityForResult(choose, pickerCode);
            } catch (ActivityNotFoundException unavailable) {
                finishSelection(null);
                Toast.makeText(MainActivity.this, R.string.no_picker, Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private void finishSelection(Uri[] uris) {
        ValueCallback<Uri[]> pending = fileSelection;
        fileSelection = null;
        if (pending != null) pending.onReceiveValue(uris);
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (exporter.onActivityResult(code, result, data) || code != pickerCode || fileSelection == null) return;
        ArrayList<Uri> selected = new ArrayList<>();
        if (result == RESULT_OK && data != null && currentOrigin() != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) addDocument(selected, clip.getItemAt(i).getUri());
            } else addDocument(selected, data.getData());
        }
        finishSelection(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
    }

    private static void addDocument(ArrayList<Uri> list, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme())) list.add(uri);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        navigation++;
        exporter.reset();
        finishSelection(null);
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
