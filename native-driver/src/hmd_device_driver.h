// hmd_device_driver.h — the virtual HMD itself. Implements the minimum of
// vr::ITrackedDeviceServerDriver needed for SteamVR to treat this as a real
// headset: pose updates, basic display properties, and activation lifecycle.
#pragma once
#include <openvr_driver.h>
#include "pose_bridge.h"

class HmdDeviceDriver : public vr::ITrackedDeviceServerDriver {
public:
  explicit HmdDeviceDriver(PoseBridge* bridge) : bridge_(bridge) {}

  vr::EVRInitError Activate(uint32_t unObjectId) override {
    objectId_ = unObjectId;
    vr::PropertyContainerHandle_t props =
        vr::VRProperties()->TrackedDeviceToPropertyContainer(objectId_);

    vr::VRProperties()->SetStringProperty(props, vr::Prop_ModelNumber_String, "DIYVR_HMD_01");
    vr::VRProperties()->SetStringProperty(props, vr::Prop_ManufacturerName_String, "DIY");
    vr::VRProperties()->SetStringProperty(props, vr::Prop_TrackingSystemName_String, "diyvr");

    // Rendered eye resolution — tune to the phone's screen, e.g. a common
    // 1080x2400 phone split per-eye is ~1200x2400 before distortion.
    vr::VRProperties()->SetInt32Property(props, vr::Prop_DisplayMCType_Int32, vr::DIRECT_MODE_EDID_VID, 0);
    vr::VRProperties()->SetFloatProperty(props, vr::Prop_UserIpdMeters_Float, 0.063f);
    vr::VRProperties()->SetFloatProperty(props, vr::Prop_UserHeadToEyeDepthMeters_Float, 0.0f);
    vr::VRProperties()->SetFloatProperty(props, vr::Prop_DisplayFrequency_Float, 72.0f);
    vr::VRProperties()->SetFloatProperty(props, vr::Prop_SecondsFromVsyncToPhotons_Float, 0.011f);

    // 3DoF only in this build: report as an HMD, but we never feed positional
    // deltas beyond the origin (see hmd_device_driver.cpp GetPose()).
    vr::VRProperties()->SetBoolProperty(props, vr::Prop_IsOnDesktop_Bool, false);

    return vr::VRInitError_None;
  }

  void Deactivate() override { objectId_ = vr::k_unTrackedDeviceIndexInvalid; }
  void EnterStandby() override {}
  void* GetComponent(const char* pchComponentNameAndVersion) override { return nullptr; }
  void DebugRequest(const char* pchRequest, char* pchResponseBuffer, uint32_t unResponseBufferSize) override {
    if (unResponseBufferSize >= 1) pchResponseBuffer[0] = 0;
  }

  vr::DriverPose_t GetPose() override;

  uint32_t objectId() const { return objectId_; }

private:
  PoseBridge* bridge_;
  uint32_t objectId_ = vr::k_unTrackedDeviceIndexInvalid;
};
