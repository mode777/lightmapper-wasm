#include <GLES3/gl3.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5_webgl.h>

#define LIGHTMAPPER_IMPLEMENTATION
#include "lightmapper.h"

EMSCRIPTEN_KEEPALIVE int lmwLM_NONE(void) { return LM_NONE; }
EMSCRIPTEN_KEEPALIVE int lmwLM_UNSIGNED_BYTE(void) { return LM_UNSIGNED_BYTE; }
EMSCRIPTEN_KEEPALIVE int lmwLM_UNSIGNED_SHORT(void) { return LM_UNSIGNED_SHORT; }
EMSCRIPTEN_KEEPALIVE int lmwLM_UNSIGNED_INT(void) { return LM_UNSIGNED_INT; }
EMSCRIPTEN_KEEPALIVE int lmwLM_FLOAT(void) { return LM_FLOAT; }
EMSCRIPTEN_KEEPALIVE int lmwLM_FALSE(void) { return LM_FALSE; }
EMSCRIPTEN_KEEPALIVE int lmwLM_TRUE(void) { return LM_TRUE; }
EMSCRIPTEN_KEEPALIVE int lmwLM_ALL_CHANNELS(void) { return LM_ALL_CHANNELS; }

EMSCRIPTEN_KEEPALIVE int lmwGetCurrentContext(void)
{
    return (int)emscripten_webgl_get_current_context();
}

EMSCRIPTEN_KEEPALIVE int lmwMakeContextCurrent(int contextHandle)
{
    return emscripten_webgl_make_context_current((EMSCRIPTEN_WEBGL_CONTEXT_HANDLE)contextHandle);
}

EMSCRIPTEN_KEEPALIVE lm_context *lmwCreate(
    int hemisphereSize,
    float zNear,
    float zFar,
    float clearR,
    float clearG,
    float clearB,
    int interpolationPasses,
    float interpolationThreshold,
    float cameraToSurfaceDistanceModifier)
{
    return lmCreate(
        hemisphereSize,
        zNear,
        zFar,
        clearR,
        clearG,
        clearB,
        interpolationPasses,
        interpolationThreshold,
        cameraToSurfaceDistanceModifier);
}

EMSCRIPTEN_KEEPALIVE void lmwDestroy(lm_context *ctx)
{
    lmDestroy(ctx);
}

EMSCRIPTEN_KEEPALIVE void lmwSetTargetLightmap(lm_context *ctx, float *outLightmap, int w, int h, int c)
{
    lmSetTargetLightmap(ctx, outLightmap, w, h, c);
}

EMSCRIPTEN_KEEPALIVE void lmwSetGeometry(
    lm_context *ctx,
    const float *transformationMatrix,
    int positionsType,
    const void *positionsXYZ,
    int positionsStride,
    int normalsType,
    const void *normalsXYZ,
    int normalsStride,
    int lightmapCoordsType,
    const void *lightmapCoordsUV,
    int lightmapCoordsStride,
    int count,
    int indicesType,
    const void *indices)
{
    lmSetGeometry(
        ctx,
        transformationMatrix,
        (lm_type)positionsType,
        positionsXYZ,
        positionsStride,
        (lm_type)normalsType,
        normalsXYZ,
        normalsStride,
        (lm_type)lightmapCoordsType,
        lightmapCoordsUV,
        lightmapCoordsStride,
        count,
        (lm_type)indicesType,
        indices);
}

EMSCRIPTEN_KEEPALIVE int lmwBegin(lm_context *ctx, int *outViewport4, float *outView4x4, float *outProjection4x4)
{
    return lmBegin(ctx, outViewport4, outView4x4, outProjection4x4);
}

EMSCRIPTEN_KEEPALIVE void lmwEnd(lm_context *ctx)
{
    lmEnd(ctx);
}

EMSCRIPTEN_KEEPALIVE float lmwProgress(lm_context *ctx)
{
    return lmProgress(ctx);
}

EMSCRIPTEN_KEEPALIVE float lmwImageMin(const float *image, int w, int h, int c, int m)
{
    return lmImageMin(image, w, h, c, m);
}

EMSCRIPTEN_KEEPALIVE float lmwImageMax(const float *image, int w, int h, int c, int m)
{
    return lmImageMax(image, w, h, c, m);
}

EMSCRIPTEN_KEEPALIVE void lmwImageAdd(float *image, int w, int h, int c, float value, int m)
{
    lmImageAdd(image, w, h, c, value, m);
}

EMSCRIPTEN_KEEPALIVE void lmwImageScale(float *image, int w, int h, int c, float factor, int m)
{
    lmImageScale(image, w, h, c, factor, m);
}

EMSCRIPTEN_KEEPALIVE void lmwImagePower(float *image, int w, int h, int c, float exponent, int m)
{
    lmImagePower(image, w, h, c, exponent, m);
}

EMSCRIPTEN_KEEPALIVE void lmwImageDilate(const float *image, float *outImage, int w, int h, int c)
{
    lmImageDilate(image, outImage, w, h, c);
}

EMSCRIPTEN_KEEPALIVE void lmwImageSmooth(const float *image, float *outImage, int w, int h, int c)
{
    lmImageSmooth(image, outImage, w, h, c);
}

EMSCRIPTEN_KEEPALIVE void lmwImageDownsample(const float *image, float *outImage, int w, int h, int c)
{
    lmImageDownsample(image, outImage, w, h, c);
}

EMSCRIPTEN_KEEPALIVE void lmwImageFtoUB(const float *image, unsigned char *outImage, int w, int h, int c, float maxValue)
{
    lmImageFtoUB(image, outImage, w, h, c, maxValue);
}
