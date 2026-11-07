// dllmain.cpp — the single C-style export SteamVR looks for in every
// driver DLL: HmdDriverFactory. This is the entire "contract" between
// SteamVR and a driver binary.
#include <openvr_driver.h>
#include <cstring>
#include "device_provider.h"

static DeviceProvider g_deviceProvider;

extern "C" __declspec(dllexport)
void* HmdDriverFactory(const char* pInterfaceName, int* pReturnCode) {
  if (std::strcmp(vr::IServerTrackedDeviceProvider_Version, pInterfaceName) == 0) {
    return &g_deviceProvider;
  }
  if (pReturnCode) *pReturnCode = vr::VRInitError_Init_InterfaceNotFound;
  return nullptr;
}
