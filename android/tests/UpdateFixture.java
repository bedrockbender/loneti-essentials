package test.loneti.smoke;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.charset.StandardCharsets;

/** Only the updater uses Java networking. WebView has its own offline fixture. */
final class UpdateFixture {
    static void serve(int code, String version) {
        byte[] json = ("{\"versionCode\":" + code + ",\"versionName\":\"" + version + "\"}").getBytes(StandardCharsets.UTF_8);
        URL.setURLStreamHandlerFactory(protocol -> !"https".equals(protocol) ? null : new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) throws IOException {
                if (!url.toString().equals("https://bedrockbender.github.io/loneti-essentials/android/latest.json")) {
                    throw new IOException("Unexpected fixture request");
                }
                return new HttpURLConnection(url) {
                    @Override public void connect() {}
                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                    @Override public int getResponseCode() { return 200; }
                    @Override public InputStream getInputStream() { return new ByteArrayInputStream(json); }
                };
            }
        });
    }
}
