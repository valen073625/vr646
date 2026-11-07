#include "device_provider.h"
#include <openvr_driver.h>

vr::EVRInitError DeviceProvider::Init(vr::IVRDriverContext* pDriverContext) {
  VR_INIT_SERVER_DRIVER_CONTEXT(pDriverContext);

  bridge_ = std::make_unique<PoseBridge>();
  if (!bridge_->Start(27015)) {
    return vr::VRInitError_Driver_Failed;
  }

  hmd_ = std::make_unique<HmdDeviceDriver>(bridge_.get());
  vr::VRServerDriverHost()->TrackedDeviceAdded(
      "DIYVR_HMD_01",
      vr::TrackedDeviceClass_HMD,
      hmd_.get());

  return vr::VRInitError_None;
}

void DeviceProvider::Cleanup() {
  if (bridge_) bridge_->Stop();
  VR_CLEANUP_SERVER_DRIVER_CONTEXT();
}

void DeviceProvider::RunFrame() {
  if (!bridge_ || !hmd_) return;
  bridge_->Poll();
  if (hmd_->objectId() != vr::k_unTrackedDeviceIndexInvalid) {
    vr::VRServerDriverHost()->TrackedDevicePoseUpdated(
        hmd_->objectId(), hmd_->GetPose(), sizeof(vr::DriverPose_t));
  }
}
