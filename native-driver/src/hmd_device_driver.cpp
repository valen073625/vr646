#include "hmd_device_driver.h"

vr::DriverPose_t HmdDeviceDriver::GetPose() {
  vr::DriverPose_t pose = { 0 };
  pose.poseIsValid = true;
  pose.result = vr::TrackingResult_Running_OK;
  pose.deviceIsConnected = true;

  pose.qWorldFromDriverRotation = { 1, 0, 0, 0 };
  pose.qDriverFromHeadRotation = { 1, 0, 0, 0 };

  PosePacket p = bridge_->Latest();
  pose.qRotation.w = p.qw;
  pose.qRotation.x = p.qx;
  pose.qRotation.y = p.qy;
  pose.qRotation.z = p.qz;

  // 3DoF build: head stays at a fixed standing height; only orientation
  // comes from the phone. (See native-driver/README.md for notes on adding
  // 6DoF via phone AR world tracking later.)
  pose.vecPosition[0] = p.x;
  pose.vecPosition[1] = 1.6 + p.y;
  pose.vecPosition[2] = p.z;

  pose.vecVelocity[0] = pose.vecVelocity[1] = pose.vecVelocity[2] = 0;
  pose.vecAngularVelocity[0] = pose.vecAngularVelocity[1] = pose.vecAngularVelocity[2] = 0;

  pose.willDriftInYaw = false;
  pose.shouldApplyHeadModel = false;

  return pose;
}
