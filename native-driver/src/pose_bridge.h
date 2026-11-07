// pose_bridge.h — reads the UDP pose packets sent by the Electron app
// (see pc-app/main.js `sendPoseToDriver`). Loopback-only, no auth needed:
// nothing outside the local machine can reach 127.0.0.1.
#pragma once

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#endif
#include <cstdint>
#include <cstring>
#include <mutex>

struct PosePacket {
  float qw = 1, qx = 0, qy = 0, qz = 0;
  float moveX = 0, moveZ = 0;
  float x = 0, y = 0, z = 0;
  uint32_t flags = 0; // bit0 = walking, bit1 = recenter pulse
};

class PoseBridge {
public:
  bool Start(uint16_t port = 27015) {
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) return false;

    sock_ = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock_ == INVALID_SOCKET) return false;

    u_long nonBlocking = 1;
    ioctlsocket(sock_, FIONBIO, &nonBlocking);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    addr.sin_port = htons(port);
    if (bind(sock_, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
      return false;
    }
    return true;
  }

  // Call once per frame (e.g. from RunFrame). Drains all pending packets so
  // we never fall behind if the OS buffers a short burst, keeping only the
  // most recent sample — we want latest-pose, not queued history.
  void Poll() {
    char buf[64];
    sockaddr_in from{};
    int fromLen = sizeof(from);
    int n;
    while ((n = recvfrom(sock_, buf, sizeof(buf), 0, (sockaddr*)&from, &fromLen)) > 0) {
      if (n >= (int)sizeof(RawLayout)) {
        RawLayout raw;
        std::memcpy(&raw, buf, sizeof(raw));
        std::lock_guard<std::mutex> lock(mutex_);
        latest_.qw = raw.qw; latest_.qx = raw.qx; latest_.qy = raw.qy; latest_.qz = raw.qz;
        latest_.moveX = raw.moveX; latest_.moveZ = raw.moveZ;
        latest_.x = raw.x; latest_.y = raw.y; latest_.z = raw.z;
        latest_.flags = raw.flags;
      }
    }
  }

  PosePacket Latest() {
    std::lock_guard<std::mutex> lock(mutex_);
    return latest_;
  }

  void Stop() {
    if (sock_ != INVALID_SOCKET) closesocket(sock_);
    WSACleanup();
  }

private:
  // Must match the 40-byte little-endian layout written in pc-app/main.js.
  #pragma pack(push, 1)
  struct RawLayout {
    float qw, qx, qy, qz;
    float moveX, moveZ;
    float x, y, z;
    uint32_t flags;
  };
  #pragma pack(pop)

  SOCKET sock_ = INVALID_SOCKET;
  PosePacket latest_;
  std::mutex mutex_;
};
