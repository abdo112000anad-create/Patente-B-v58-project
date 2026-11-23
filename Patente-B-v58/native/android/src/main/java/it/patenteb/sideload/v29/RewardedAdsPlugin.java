package it.patenteb.sideload.v29;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardItem;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.FormError;
import com.google.android.ump.UserMessagingPlatform;

/** Google test ads only. Replace nothing here with a live unit without a separate, approved release task. */
@CapacitorPlugin(name = "RewardedAds")
public class RewardedAdsPlugin extends Plugin {
    private static final String TEST_REWARDED_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";
    private static final String TEST_INTERSTITIAL_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();

    private ConsentInformation consentInformation;
    private boolean adsInitialized = false;
    private boolean initializationInFlight = false;
    private boolean adInFlight = false;
    private boolean rewardEarned = false;
    private boolean activeInterstitialCall = false;
    private int rewardAmount = 0;
    private String rewardType = "";
    private PluginCall activeCall;

    @PluginMethod
    public void updateConsent(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve(consentResult(false, false, "activity_unavailable"));
            return;
        }
        mainHandler.post(() -> requestConsent(activity, call));
    }

    private void requestConsent(Activity activity, PluginCall call) {
        consentInformation = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters parameters = new ConsentRequestParameters.Builder().build();
        consentInformation.requestConsentInfoUpdate(
                activity,
                parameters,
                () -> mainHandler.post(() -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                        activity,
                        formError -> mainHandler.post(() -> call.resolve(consentResult(
                                consentInformation.canRequestAds(),
                                privacyOptionsRequired(),
                                formError == null ? null : formError.getMessage()
                        )))
                )),
                requestError -> mainHandler.post(() -> call.resolve(consentResult(
                        consentInformation.canRequestAds(),
                        privacyOptionsRequired(),
                        requestError.getMessage()
                )))
        );
    }

    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve(consentResult(false, false, "activity_unavailable"));
            return;
        }
        mainHandler.post(() -> {
            if (consentInformation == null || !privacyOptionsRequired()) {
                call.resolve(consentResult(canRequestAds(), privacyOptionsRequired(), null));
                return;
            }
            UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> mainHandler.post(() -> call.resolve(
                    consentResult(canRequestAds(), privacyOptionsRequired(), formError == null ? null : formError.getMessage())
            )));
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve(rewardResult(false, "activity_unavailable"));
            return;
        }
        mainHandler.post(() -> prepareAndLoad(activity, call));
    }


    @PluginMethod
    public void showInterstitial(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.resolve(interstitialResult(false, "activity_unavailable"));
            return;
        }
        mainHandler.post(() -> prepareAndLoadInterstitial(activity, call));
    }

    private void prepareAndLoadInterstitial(Activity activity, PluginCall call) {
        synchronized (lock) {
            if (adInFlight || initializationInFlight) {
                call.resolve(interstitialResult(false, "another_ad_is_in_progress"));
                return;
            }
            if (consentInformation == null || !consentInformation.canRequestAds()) {
                call.resolve(interstitialResult(false, "consent_does_not_allow_ads"));
                return;
            }
            adInFlight = true;
            activeInterstitialCall = true;
            activeCall = call;
            rewardEarned = false;
            rewardAmount = 0;
            rewardType = "";
            if (!adsInitialized) initializationInFlight = true;
        }
        if (adsInitialized) {
            loadInterstitial(activity, call);
            return;
        }
        MobileAds.initialize(activity, initializationStatus -> mainHandler.post(() -> {
            synchronized (lock) {
                initializationInFlight = false;
                adsInitialized = true;
            }
            loadInterstitial(activity, call);
        }));
    }

    private void loadInterstitial(Activity activity, PluginCall call) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            finishInterstitial(call, false, "activity_unavailable");
            return;
        }
        try {
            InterstitialAd.load(
                activity,
                TEST_INTERSTITIAL_UNIT_ID,
                new AdRequest.Builder().build(),
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(@NonNull InterstitialAd ad) {
                        mainHandler.post(() -> showLoadedInterstitial(activity, call, ad));
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull LoadAdError error) {
                        mainHandler.post(() -> finishInterstitial(call, false, "ad_load_failed: " + error.getMessage()));
                    }
                }
            );
        } catch (RuntimeException error) {
            finishInterstitial(call, false, "ad_load_failed: " + error.getMessage());
        }
    }

    private void showLoadedInterstitial(Activity activity, PluginCall call, InterstitialAd ad) {
        if (!isActive(call) || activity.isFinishing() || activity.isDestroyed()) {
            finishInterstitial(call, false, "activity_unavailable");
            return;
        }
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                finishInterstitial(call, true, null);
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                finishInterstitial(call, false, "ad_show_failed: " + error.getMessage());
            }
        });
        try {
            ad.show(activity);
        } catch (RuntimeException error) {
            finishInterstitial(call, false, "ad_show_failed: " + error.getMessage());
        }
    }

    private void finishInterstitial(PluginCall call, boolean shown, String reason) {
        synchronized (lock) {
            if (activeCall != call) return;
            activeCall = null;
            adInFlight = false;
            activeInterstitialCall = false;
            rewardEarned = false;
        }
        call.resolve(interstitialResult(shown, reason));
    }

    private void prepareAndLoad(Activity activity, PluginCall call) {
        synchronized (lock) {
            if (adInFlight || initializationInFlight) {
                call.resolve(rewardResult(false, "another_ad_is_in_progress"));
                return;
            }
            if (consentInformation == null || !consentInformation.canRequestAds()) {
                call.resolve(rewardResult(false, "consent_does_not_allow_ads"));
                return;
            }
            adInFlight = true;
            activeCall = call;
            activeInterstitialCall = false;
            rewardEarned = false;
            rewardAmount = 0;
            rewardType = "";
            if (!adsInitialized) initializationInFlight = true;
        }
        if (adsInitialized) {
            loadRewarded(activity, call);
            return;
        }
        MobileAds.initialize(activity, initializationStatus -> mainHandler.post(() -> {
            synchronized (lock) {
                initializationInFlight = false;
                adsInitialized = true;
            }
            loadRewarded(activity, call);
        }));
    }

    private void loadRewarded(Activity activity, PluginCall call) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            finishWithoutReward(call, "activity_unavailable");
            return;
        }
        RewardedAd.load(
                activity,
                TEST_REWARDED_UNIT_ID,
                new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(@NonNull RewardedAd ad) {
                        mainHandler.post(() -> showLoadedAd(activity, call, ad));
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull LoadAdError error) {
                        mainHandler.post(() -> finishWithoutReward(call, "ad_load_failed: " + error.getMessage()));
                    }
                }
        );
    }

    private void showLoadedAd(Activity activity, PluginCall call, RewardedAd ad) {
        if (!isActive(call) || activity.isFinishing() || activity.isDestroyed()) {
            finishWithoutReward(call, "activity_unavailable");
            return;
        }
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                finishAd(call);
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                finishWithoutReward(call, "ad_show_failed: " + error.getMessage());
            }
        });
        try {
            ad.show(activity, this::recordEarnedReward);
        } catch (RuntimeException error) {
            finishWithoutReward(call, "ad_show_failed: " + error.getMessage());
        }
    }

    private void recordEarnedReward(@NonNull RewardItem reward) {
        synchronized (lock) {
            if (activeCall == null || !adInFlight) return;
            rewardEarned = true;
            rewardAmount = reward.getAmount();
            rewardType = reward.getType();
        }
    }

    private void finishAd(PluginCall call) {
        boolean earned;
        int amount;
        String type;
        synchronized (lock) {
            if (activeCall != call) return;
            earned = rewardEarned;
            amount = rewardAmount;
            type = rewardType;
            activeCall = null;
            adInFlight = false;
            activeInterstitialCall = false;
        }
        JSObject result = rewardResult(earned, earned ? null : "dismissed_without_reward");
        if (earned) {
            result.put("amount", amount);
            result.put("type", type);
        }
        call.resolve(result);
    }

    private void finishWithoutReward(PluginCall call, String reason) {
        synchronized (lock) {
            if (activeCall != call) return;
            activeCall = null;
            adInFlight = false;
            activeInterstitialCall = false;
            rewardEarned = false;
        }
        call.resolve(rewardResult(false, reason));
    }

    private JSObject interstitialResult(boolean shown, String reason) {
        JSObject result = new JSObject();
        result.put("shown", shown);
        if (reason != null) result.put("reason", reason);
        return result;
    }

    private boolean isActive(PluginCall call) {
        synchronized (lock) {
            return activeCall == call && adInFlight;
        }
    }

    private boolean canRequestAds() {
        return consentInformation != null && consentInformation.canRequestAds();
    }

    private boolean privacyOptionsRequired() {
        return consentInformation != null && consentInformation.getPrivacyOptionsRequirementStatus()
                == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    private JSObject consentResult(boolean canRequest, boolean privacyRequired, String error) {
        JSObject result = new JSObject();
        result.put("canRequestAds", canRequest);
        result.put("privacyOptionsRequired", privacyRequired);
        if (error != null && !error.isEmpty()) result.put("error", error);
        return result;
    }

    private JSObject rewardResult(boolean earned, String reason) {
        JSObject result = new JSObject();
        result.put("rewarded", earned);
        if (reason != null) result.put("reason", reason);
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        PluginCall call;
        boolean wasInterstitial;
        synchronized (lock) {
            call = activeCall;
            wasInterstitial = activeInterstitialCall;
            activeCall = null;
            adInFlight = false;
            activeInterstitialCall = false;
            initializationInFlight = false;
            rewardEarned = false;
        }
        if (call != null) call.resolve(wasInterstitial ? interstitialResult(false, "activity_destroyed") : rewardResult(false, "activity_destroyed"));
    }
}
