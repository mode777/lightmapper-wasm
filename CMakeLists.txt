cmake_minimum_required(VERSION 3.20)

project(lightmapper_wasm LANGUAGES C)

option(LM_BUILD_WASM "Build the lightmapper WebAssembly module" ON)

if(LM_BUILD_WASM)
    if(NOT EMSCRIPTEN)
        message(FATAL_ERROR "LM_BUILD_WASM requires Emscripten. Configure with: emcmake cmake -S . -B build/wasm")
    endif()

    add_subdirectory(wasm)
endif()
