package com.example

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets

class MainActivity : ComponentActivity() {

  private var webView: WebView? = null
  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private var pendingSaveContent: String? = null
  private var isDarkTheme by mutableStateOf(false)

  private val fileChooserLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val callback = filePathCallback
      filePathCallback = null
      if (callback == null) return@registerForActivityResult

      var results: Array<Uri>? = null
      if (result.resultCode == Activity.RESULT_OK && result.data != null) {
        val data = result.data
        val clipData = data?.clipData
        if (clipData != null && clipData.itemCount > 0) {
          results = Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
        } else if (data?.data != null) {
          results = arrayOf(data.data!!)
        }
      }
      callback.onReceiveValue(results)
    }

  private val saveDocumentLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val content = pendingSaveContent
      pendingSaveContent = null
      if (result.resultCode == Activity.RESULT_OK && content != null) {
        val uri = result.data?.data ?: return@registerForActivityResult
        try {
          contentResolver.openOutputStream(uri)?.use { os ->
            os.write(content.toByteArray(StandardCharsets.UTF_8))
            os.flush()
          }
        } catch (_: Exception) {}
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val nightFlags = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    isDarkTheme = nightFlags == Configuration.UI_MODE_NIGHT_YES
    enableEdgeToEdge()
    applySystemBarTheme(isDarkTheme)

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          val wv = webView
          if (wv == null) {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            return
          }
          wv.evaluateJavascript(
            "(function(){ return window.__handleAndroidBack ? Boolean(window.__handleAndroidBack()) : false; })()"
          ) { result ->
            if (result != "true") {
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
              isEnabled = true
            }
          }
        }
      }
    )

    setContent {
      val bgColor = if (isDarkTheme) Color(0xFF0D1110) else Color(0xFFF6F7F5)
      Box(
        modifier =
          Modifier.fillMaxSize()
            .background(bgColor)
            .windowInsetsPadding(WindowInsets.safeDrawing)
      ) {
        AndroidView(
          modifier = Modifier.fillMaxSize(),
          factory = { context ->
            createConfiguredWebView(context).also { wv ->
              webView = wv
              wv.loadUrl("https://appassets.androidplatform.net/assets/index.html")
            }
          }
        )
      }
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun createConfiguredWebView(context: android.content.Context): WebView {
    return WebView(context).apply {
      layoutParams =
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      setBackgroundColor(
        if (isDarkTheme) AndroidColor.parseColor("#0D1110")
        else AndroidColor.parseColor("#F6F7F5")
      )

      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        defaultTextEncodingName = "UTF-8"
        allowFileAccess = false
        allowContentAccess = false
        databaseEnabled = true
        cacheMode = WebSettings.LOAD_DEFAULT
        useWideViewPort = true
        loadWithOverviewMode = true
        setSupportZoom(false)
      }

      addJavascriptInterface(TabunganBridge(), "TabunganAndroid")

      webViewClient =
        object : WebViewClient() {
          override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
          ): WebResourceResponse? {
            val url = request?.url ?: return null
            if (url.host == "appassets.androidplatform.net") {
              val rawPath = url.path ?: "/assets/index.html"
              val cleanPath =
                when {
                  rawPath == "/" || rawPath == "/assets/" -> "index.html"
                  rawPath.startsWith("/assets/") -> rawPath.removePrefix("/assets/")
                  else -> rawPath.removePrefix("/")
                }
              return serveAsset(cleanPath)
            }
            return WebResourceResponse(
              "text/plain",
              "UTF-8",
              403,
              "Offline",
              emptyMap(),
              ByteArrayInputStream(ByteArray(0))
            )
          }
        }

      webChromeClient =
        object : WebChromeClient() {
          override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
          ): Boolean {
            this@MainActivity.filePathCallback?.onReceiveValue(null)
            this@MainActivity.filePathCallback = filePathCallback

            val intent =
              Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(
                  Intent.EXTRA_MIME_TYPES,
                  arrayOf(
                    "application/json",
                    "text/plain",
                    "application/octet-stream",
                    "text/*"
                  )
                )
              }
            return try {
              fileChooserLauncher.launch(Intent.createChooser(intent, "Pilih File Backup JSON"))
              true
            } catch (_: Exception) {
              this@MainActivity.filePathCallback = null
              false
            }
          }
        }
    }
  }

  private fun serveAsset(assetPath: String): WebResourceResponse? {
    if (assetPath.contains("..")) return null
    return try {
      val stream = assets.open(assetPath)
      val mimeType =
        when {
          assetPath.endsWith(".html") -> "text/html"
          assetPath.endsWith(".css") -> "text/css"
          assetPath.endsWith(".js") -> "application/javascript"
          assetPath.endsWith(".webmanifest") || assetPath.endsWith(".json") ->
            "application/manifest+json"
          assetPath.endsWith(".svg") -> "image/svg+xml"
          assetPath.endsWith(".png") -> "image/png"
          assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg") -> "image/jpeg"
          assetPath.endsWith(".ttf") -> "font/ttf"
          else -> "application/octet-stream"
        }
      val encoding =
        if (
          mimeType.startsWith("text/") ||
            mimeType == "application/javascript" ||
            mimeType == "application/manifest+json" ||
            mimeType == "image/svg+xml"
        ) {
          "UTF-8"
        } else {
          null
        }
      val headers = mapOf(
        "Access-Control-Allow-Origin" to "*",
        "Cache-Control" to "no-cache"
      )
      WebResourceResponse(mimeType, encoding, 200, "OK", headers, stream)
    } catch (_: Exception) {
      null
    }
  }

  private fun applySystemBarTheme(dark: Boolean) {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = !dark
    controller.isAppearanceLightNavigationBars = !dark
  }

  override fun onDestroy() {
    webView?.destroy()
    webView = null
    super.onDestroy()
  }

  inner class TabunganBridge {
    @JavascriptInterface
    fun saveBackup(fileName: String, content: String) {
      runOnUiThread {
        pendingSaveContent = content
        val mime =
          if (fileName.endsWith(".html", ignoreCase = true)) "text/html" else "application/json"
        val intent =
          Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, fileName)
          }
        try {
          saveDocumentLauncher.launch(intent)
        } catch (_: Exception) {
          pendingSaveContent = null
        }
      }
    }

    @JavascriptInterface
    fun setTheme(theme: String) {
      val dark = theme == "dark"
      runOnUiThread {
        isDarkTheme = dark
        applySystemBarTheme(dark)
        webView?.setBackgroundColor(
          if (dark) AndroidColor.parseColor("#0D1110")
          else AndroidColor.parseColor("#F6F7F5")
        )
      }
    }
  }
}
