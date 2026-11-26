package test.loneti.smoke;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.provider.MediaStore;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

final class PackFixture {
    static final String NAME = "Android smoke pack";
    static final String FILE_NAME = "loneti-fixture.lesp";

    static Uri putInDownloads(Context context) throws IOException {
        Bitmap bitmap = Bitmap.createBitmap(300, 300, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint();
        paint.setColor(Color.BLUE);
        canvas.drawRect(100, 100, 200, 200, paint);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        try {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, png)) {
                throw new IOException("Could not write synthetic Smile PNG");
            }
        } finally {
            bitmap.recycle();
        }
        byte[] name = NAME.getBytes(StandardCharsets.UTF_8);
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        ContentResolver resolver = context.getContentResolver();
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Could not add fixture to Downloads");
        try {
            try (OutputStream output = resolver.openOutputStream(uri);
                    DataOutputStream pack = new DataOutputStream(output)) {
                pack.write(new byte[]{0x4c, 0x45, 0x53, 0x50, 1, 0});
                pack.writeShort(name.length);
                pack.writeShort(1);
                pack.write(name);
                pack.writeInt(png.size());
                png.writeTo(pack);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        } catch (IOException failure) {
            resolver.delete(uri, null, null);
            throw failure;
        }
    }
}
