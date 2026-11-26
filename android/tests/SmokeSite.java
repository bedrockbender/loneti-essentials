package test.loneti.smoke;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SmokeSite extends WebViewClient {
    private static final String HOST = "loneti.art";
    static final String START = "https://" + HOST + "/";
    private static final Pattern ASSET = Pattern.compile("/pic/smiles/([a-z0-9-]+?)(-sm)?\\.png");
    private final WebViewClient production;
    private final byte[] thumbnail = png(130, Color.RED);
    private final Map<String, byte[]> assets = new LinkedHashMap<>();
    private final Map<String, String> items = new LinkedHashMap<>();
    private int saves;
    private boolean rejectNextSave;

    SmokeSite(WebViewClient production) {
        this.production = production;
        assets.put("fixture", png(300, Color.RED));
        assets.put("comment", png(300, Color.GREEN));
        assets.put("wall", png(300, Color.MAGENTA));
        assets.put("reply", png(300, Color.YELLOW));
        items.put("101", "fixture");
    }

    @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
        production.onPageStarted(view, url, icon);
    }

    @Override public void onPageFinished(WebView view, String url) {
        production.onPageFinished(view, url);
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !HOST.equals(request.getUrl().getHost()) || production.shouldOverrideUrlLoading(view, request);
    }

    @Override public synchronized WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) {
            return reply(403, "text/plain", new byte[0]);
        }
        String path = url.getPath();
        if ("/".equals(path)) {
            return page("<h1>Local LONETI smoke fixture</h1><a href='/draw'>Open smoke editor</a>");
        }
        if ("/draw".equals(path)) return editor();
        if ("/draw/frame".equals(path)) {
            return page("<h2>Frame fixture</h2>",
                    "window.fixtureFrameClean=!window.__lonetiCollectorInstalled"
                    + "&&!Object.getOwnPropertyDescriptor(Object.prototype,'transform_canvas');");
        }
        if ("/pict400_100".equals(path)) {
            return comment("comment", "<a href='/pm?u=42'>Open direct message</a>");
        }
        if ("/pm".equals(path)) {
            return page("<a href='/fixture-wall'>Open user Wall</a><div id='list_msg'><div class='one_msg'>"
                    + "<div class='smile_msg'><img src='/pic/smiles/fixture.png'></div></div></div>");
        }
        if ("/fixture-wall".equals(path)) {
            return page("<a href='/settings?act=smiles'>Open smoke library</a>"
                    + "<div id='list_comments' data-iduserwall='42'><div class='wall-post'>"
                    + commentBody("wall")
                    + "<button onclick='this.nextElementSibling.append(document.querySelector(\"template\").content.cloneNode(true));"
                    + "this.disabled=true'>Show replies</button><div class='wall-post__comments'></div>"
                    + "<template>" + commentBody("reply") + "</template></div></div>");
        }
        if ("/settings".equals(path) && "smiles".equals(url.getQueryParameter("act"))) {
            return library();
        }
        String data = url.getQueryParameter("fixture_data");
        if ("/settings".equals(path) && data != null) return save(data);
        Matcher image = ASSET.matcher(path == null ? "" : path);
        if (image.matches() && assets.containsKey(image.group(1))) {
            return reply(200, "image/png", image.group(2) == null ? assets.get(image.group(1)) : thumbnail);
        }
        return reply(404, "text/plain", new byte[0]);
    }

    synchronized int saveCount() { return saves; }
    synchronized void rejectNextSave() { rejectNextSave = true; }

    private static WebResourceResponse editor() {
        return page("<a href='/pict400_100'>Open smoke drawing</a>"
                        + "<style>#tools .one_tool{display:inline-block;width:30px;height:30px}</style>"
                        + "<div class='cont-draw js--cont-draw'>"
                        + "<div class='cont-tools-box box-mobile-menu'>"
                        + "<div class='content-mobile-menu cont-tools-box__content-mobile'><div id='cont_tools'>"
                        + "<div id='tools'><div class='one_tool tool_move' data-tool='move' title='Move'></div>"
                        + "<div class='one_tool tool_selection' data-tool='selection' title='Selection'></div>"
                        + "<div class='one_tool tool_lasso' data-tool='lasso' title='Lasso'></div>"
                        + "<div class='one_tool tool_eraser' data-tool='eraser' title='Eraser'></div></div>"
                        + "<div id='brushes'><div class='one_tool tool_brush active_tool'"
                        + " data-tool='brush' title='Brush'></div></div></div>"
                        + "<div id='cont_config'></div></div></div>"
                        + "<div class='js--container-work-canvas' style='position:relative'>"
                        + "<canvas class='js--work-canvas'></canvas></div>"
                        + "</div>"
                        + "<iframe src='/draw/frame' title='Frame fixture' hidden></iframe>",
                "window.fixtureHookAtHead=window.__lonetiCollectorInstalled===true"
                        + "&&typeof Object.getOwnPropertyDescriptor(Object.prototype,'transform_canvas')?.set==='function';"
                        + "let fixtureLayer;const fixtureUser={user_layers:{getActiveLayer(){"
                        + "const canvas=document.querySelector('.js--work-canvas');"
                        + "return fixtureLayer||(fixtureLayer={$layer:canvas,ctx:canvas.getContext('2d')});"
                        + "}},events_draw:{setDraw(){}}};"
                        + "const nativeEngine={realCoords(){},drawing_area:{getContainerWork(){"
                        + "return document.querySelector('.js--container-work-canvas');}},"
                        + "users_canvas:{getMyUser(){return fixtureUser;}},layer_actions:{checkLockLayer(){}}};"
                        + "nativeEngine.transform_canvas={coordsToDisplay(point){return point;},transform:{getInverted(){}}};"
                        + "window.fixtureObserverRemoved=!Object.getOwnPropertyDescriptor(Object.prototype,'transform_canvas');");
    }

    private static WebResourceResponse comment(String smile, String next) {
        return page(next + "<div class='list_comments'>" + commentBody(smile) + "</div>");
    }

    private static String commentBody(String smile) {
        return "<div class='one_comment'><div class='body_comment'>"
                + "Smoke comment<div class='smile_body'><img src='/pic/smiles/" + smile + "-sm.png'>"
                + "</div></div></div>";
    }

    private WebResourceResponse save(String data) {
        if (rejectNextSave) {
            rejectNextSave = false;
            return reply(403, "text/plain", new byte[0]);
        }
        if (!data.startsWith("data:image/png;base64,")) return reply(400, "text/plain", new byte[0]);
        byte[] png = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
        if (png.length < 24 || png[0] != (byte) 0x89 || png[1] != 'P'
                || png[18] != 1 || png[19] != 44 || png[22] != 1 || png[23] != 44) {
            return reply(400, "text/plain", new byte[0]);
        }
        String id = Integer.toString(101 + ++saves);
        assets.put("saved-" + id, png);
        items.put(id, "saved-" + id);
        return reply(200, "application/json", "{\"result\":\"true\"}".getBytes(StandardCharsets.UTF_8));
    }

    private WebResourceResponse library() {
        StringBuilder html = new StringBuilder("<h1>My emotes</h1><a href='/settings?new=smile'>Draw emote</a>"
                + "<div id='list_smiles'>");
        for (Map.Entry<String, String> item : items.entrySet()) {
            html.append("<div class='one_smile' data-id='").append(item.getKey())
                    .append("'><img src='/pic/smiles/").append(item.getValue())
                    .append("-sm.png'><div class='del_smile'>Delete</div></div>");
        }
        return page(html.append("</div>").toString());
    }

    private static WebResourceResponse page(String body) {
        return page(body, "");
    }

    private static WebResourceResponse page(String body, String firstScript) {
        // The platform omits POST bodies from WebResourceRequest. Relay only
        // this fixture's save form as a test-only request to the local mock.
        String html = "<!doctype html><html lang='en'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<title>Local smoke fixture</title><script>" + firstScript + "</script>"
                + "<style>body{font:16px sans-serif;padding:12px}img{width:50px;height:50px}"
                + ".one_smile{display:inline-block;padding:4px}a{display:inline-block;padding:4px}</style>"
                + "<script>const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>{"
                + "if(String(url)==='/settings?save=smile'&&options?.method==='POST'){"
                + "const fields=new URLSearchParams(options.body);if([...fields.keys()].join()!=='data_img')throw Error('Bad form');"
                + "return originalFetch('/settings?fixture_data='+encodeURIComponent(fields.get('data_img')));}"
                + "return originalFetch(url,options);};</script>"
                + "<body><a id='cur_user' href='/tester'>Fixture account</a>" + body + "</body></html>";
        return reply(200, "text/html", html.getBytes(StandardCharsets.UTF_8));
    }

    private static WebResourceResponse reply(int status, String mime, byte[] data) {
        String detail = status == 200 ? "OK" : status == 403 ? "Forbidden" : status == 400 ? "Bad Request" : "Not Found";
        return new WebResourceResponse(mime, "UTF-8", status, detail,
                Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(data));
    }

    private static byte[] png(int size, int color) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            Paint paint = new Paint();
            paint.setColor(color);
            canvas.drawRect(size / 3, size / 3, size * 2 / 3, size * 2 / 3, paint);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                throw new IllegalStateException("Could not create synthetic asset");
            }
            return output.toByteArray();
        } finally {
            bitmap.recycle();
        }
    }
}
