// device_provider.h — the driver's entry point. SteamVR loads exactly one
// instance of this per process and calls Init()/RunFrame()/Cleanup() on it.
#pragma once
#include <openvr_driver.h>
#include <memory>
#include "hmd_device_driver.h"
#include "pose_bridge.h"

class DeviceProvider : public vr::IServerTrackedDeviceProvider {
public:
  vr::EVRInitError Init(vr::IVRDriverContext* pDriverContext) override;
  void Cleanup() override;
  const char* const* GetInterfaceVersions() override { return vr::k_InterfaceVersions; }
  void RunFrame() override;
  bool ShouldBlockStandbyMode() override { return false; }
  void EnterStandby() override {}
  void LeaveStandby() override {}

private:
  std::unique_ptr<PoseBridge> bridge_;
  std::unique_ptr<HmdDeviceDriver> hmd_;
};
