package it.patenteb.sideload.v29;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RewardedAdsPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    moveTaskToBack(true);
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "typeof window.__patenteHandleNativeBack === 'function' && window.__patenteHandleNativeBack() === true",
                    handled -> { if (!"true".equals(handled)) moveTaskToBack(true); }
                );
            }
        });
    }
}
