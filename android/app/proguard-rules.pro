-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class id.tabungansaya.app.MainActivity$TabunganBridge {
    public *;
}
