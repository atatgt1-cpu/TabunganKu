package id.tabungansaya.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_SAVE_BACKUP = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingSaveContent;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        boolean isSystemDark =
                (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        applySystemTheme(isSystemDark);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setAllowFileAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        webView.addJavascriptInterface(new TabunganBridge(), "TabunganAndroid");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        new String[]{
                                "application/json",
                                "text/plain",
                                "application/octet-stream",
                                "text/*"
                        }
                );
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Pilih File Backup JSON"),
                            REQ_FILE_CHOOSER
                    );
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else if (requestCode == REQ_SAVE_BACKUP) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && content != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) {
                        os.write(content.getBytes(StandardCharsets.UTF_8));
                        os.flush();
                    }
                } catch (Exception ignored) {
                }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "(function(){ return window.__handleAndroidBack ? Boolean(window.__handleAndroidBack()) : false; })()",
                    value -> {
                        if (!"true".equals(value)) {
                            MainActivity.super.onBackPressed();
                        }
                    }
            );
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void applySystemTheme(boolean dark) {
        int bgColor = Color.parseColor(dark ? "#0D1110" : "#F6F7F5");
        int navColor = Color.parseColor(dark ? "#161C1A" : "#FFFFFF");
        if (webView != null) {
            webView.setBackgroundColor(bgColor);
        }
        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(bgColor);
            window.setNavigationBarColor(navColor);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                if (dark) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (dark) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    } else {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                decor.setSystemUiVisibility(flags);
            }
        }
    }

    public class TabunganBridge {
        @JavascriptInterface
        public void saveBackup(String fileName, String content) {
            runOnUiThread(() -> {
                pendingSaveContent = content;
                String mime = fileName != null && fileName.toLowerCase().endsWith(".html")
                        ? "text/html"
                        : "application/json";
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, fileName != null ? fileName : "tabungansaya-backup.json");
                try {
                    startActivityForResult(intent, REQ_SAVE_BACKUP);
                } catch (Exception e) {
                    pendingSaveContent = null;
                }
            });
        }

        @JavascriptInterface
        public void setTheme(String theme) {
            boolean dark = "dark".equals(theme);
            runOnUiThread(() -> applySystemTheme(dark));
        }
    }
}
