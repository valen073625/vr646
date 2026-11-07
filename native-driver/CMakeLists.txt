cmake_minimum_required(VERSION 3.15)
project(driver_diyvr)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Point this at wherever you cloned https://github.com/ValveSoftware/openvr
# (either set -DOPENVR_SDK_DIR=... on the cmake command line, or drop the
# repo's headers/ and lib/ folders under third_party/openvr/ as shown below).
if(NOT DEFINED OPENVR_SDK_DIR)
  set(OPENVR_SDK_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/openvr)
endif()

add_library(driver_diyvr SHARED
  src/dllmain.cpp
  src/device_provider.cpp
  src/hmd_device_driver.cpp
)

target_include_directories(driver_diyvr PRIVATE
  ${OPENVR_SDK_DIR}/headers
  src
)

if(WIN32)
  target_link_libraries(driver_diyvr PRIVATE
    ${OPENVR_SDK_DIR}/lib/win64/openvr_api.lib
    ws2_32
  )
endif()

set_target_properties(driver_diyvr PROPERTIES
  OUTPUT_NAME "driver_diyvr"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/driver/bin/win64
  LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/driver/bin/win64
)
