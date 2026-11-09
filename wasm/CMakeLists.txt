set(LM_WASM_TARGET lightmapper_wasm)

add_executable(${LM_WASM_TARGET}
    lightmapper_wasm.c
)

target_include_directories(${LM_WASM_TARGET}
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/../thirdparty/lightmapper
)

option(LM_WASM_LTO "Enable link-time optimization for Release builds" ON)
option(LM_WASM_SINGLE_FILE "Embed the wasm binary in the Emscripten glue (-sSINGLE_FILE=1)" OFF)

if(LM_WASM_LTO)
    target_compile_options(${LM_WASM_TARGET} PRIVATE "$<$<CONFIG:Release>:-flto>")
    target_link_options(${LM_WASM_TARGET} PRIVATE "$<$<CONFIG:Release>:-flto>")
endif()

set(LM_WASM_SINGLE_FILE_FLAGS)
if(LM_WASM_SINGLE_FILE)
    list(APPEND LM_WASM_SINGLE_FILE_FLAGS "-sSINGLE_FILE=1")
endif()

# Build as an ESM-friendly, modularized WebAssembly package for browsers.
target_link_options(${LM_WASM_TARGET}
    PRIVATE
        "-sWASM=1"
        ${LM_WASM_SINGLE_FILE_FLAGS}
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sENVIRONMENT=web"
        "-sFILESYSTEM=0"
        "-sMIN_WEBGL_VERSION=2"
        "-sMAX_WEBGL_VERSION=2"
        "-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU16','HEAPU32','HEAPF32','GL']"
        "-sEXPORTED_FUNCTIONS=['_malloc','_free','_lmwCreate','_lmwDestroy','_lmwSetTargetLightmap','_lmwSetGeometry','_lmwBegin','_lmwEnd','_lmwProgress','_lmwImageMin','_lmwImageMax','_lmwImageAdd','_lmwImageScale','_lmwImagePower','_lmwImageDilate','_lmwImageSmooth','_lmwImageDownsample','_lmwImageFtoUB','_lmwLM_NONE','_lmwLM_UNSIGNED_BYTE','_lmwLM_UNSIGNED_SHORT','_lmwLM_UNSIGNED_INT','_lmwLM_FLOAT','_lmwLM_FALSE','_lmwLM_TRUE','_lmwLM_ALL_CHANNELS','_lmwGetCurrentContext','_lmwMakeContextCurrent']"
        "--no-entry"
)

set_target_properties(${LM_WASM_TARGET} PROPERTIES
    OUTPUT_NAME "lightmapper_wasm"
    SUFFIX ".mjs"
)
