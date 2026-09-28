import * as THREE from 'three';
import { CloudItem, CloudShaderMaterial } from '../items/CloudItem';

type CloudRenderOptions = {
    pointSize?: number;
    pointType?: 'PIXEL' | 'SQUARE' | 'SPHERE';
    alpha?: number;
    colorMode?: 'I' | 'RGB' | 'FLAT';
    vmin?: number;
    vmax?: number;
};

function colorModeToUniformValue(colorMode: 'I' | 'RGB' | 'FLAT'): number {
    if (colorMode === 'RGB') return 1;
    if (colorMode === 'FLAT') return 2;
    return 0;
}

function pointTypeToUniformValue(pointType: 'PIXEL' | 'SQUARE' | 'SPHERE'): number {
    if (pointType === 'SQUARE') return 1;
    if (pointType === 'SPHERE') return 2;
    return 0;
}

function resolvePointSize(v: any, options: CloudRenderOptions, pointType: 'PIXEL' | 'SQUARE' | 'SPHERE'): number {
    const pixelRatio = typeof v.getBaseRendererPixelRatio === 'function'
        ? v.getBaseRendererPixelRatio()
        : Math.max(window.devicePixelRatio || 1, 1);
    if (options.pointSize === undefined) return 1.0 * pixelRatio;
    return pointType === 'PIXEL' ? options.pointSize * pixelRatio : options.pointSize;
}

export function renderPoints(v: any, positions: Float32Array, values: Float32Array, rgbColors?: Uint8Array): void {
    const count = values.length;
    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < count; i += 1000) { const val = values[i]; if (val < minVal) minVal = val; if (val > maxVal) maxVal = val; }
    if (minVal === Infinity) { minVal = 0; maxVal = 255; }
    if (minVal === maxVal) { minVal -= 1; maxVal += 1; }
    const renderOptions = (v.cloudRenderOptions ?? {}) as CloudRenderOptions;
    const effectiveMin = renderOptions.vmin ?? minVal;
    const effectiveMax = renderOptions.vmax ?? maxVal;
    v.dataMin = effectiveMin; v.dataMax = effectiveMax;

    let colorMode: 'I' | 'RGB' | 'FLAT' = 'I';
    if (rgbColors) {
        for (let i = 0; i < Math.min(rgbColors.length, 3000); i += 3) {
            if (rgbColors[i] > 0 || rgbColors[i + 1] > 0 || rgbColors[i + 2] > 0) { colorMode = 'RGB'; break; }
        }
    }
    colorMode = renderOptions.colorMode ?? colorMode;
    const pointType = renderOptions.pointType ?? 'PIXEL';
    const pointSize = resolvePointSize(v, renderOptions, pointType);
    const alpha = renderOptions.alpha ?? 0.1;
    const cloud = new CloudItem(positions, values, { size: pointSize, alpha, colorMode, pointType }, colorMode === 'RGB' ? rgbColors : undefined);
    const material = cloud.material as CloudShaderMaterial;
    material.uniforms.pointSize.value = pointSize;
    material.uniforms.pointType.value = pointTypeToUniformValue(pointType);
    material.uniforms.alpha.value = alpha;
    material.uniforms.colorMode.value = colorModeToUniformValue(colorMode);
    material.uniforms.vmin.value = effectiveMin; material.uniforms.vmax.value = effectiveMax;

    const saved = v.savedCloudSettings as {
        pointSize?: number;
        pointType?: number;
        alpha?: number;
        colorMode?: number;
        vmin?: number;
        vmax?: number;
        clipEnabled?: boolean;
        clipFlip?: boolean;
    } | null | undefined;

    if (saved) {
        if (typeof saved.pointSize === 'number' && Number.isFinite(saved.pointSize)) {
            material.uniforms.pointSize.value = saved.pointSize;
        }
        if (typeof saved.pointType === 'number' && Number.isFinite(saved.pointType)) {
            material.uniforms.pointType.value = saved.pointType;
        }
        if (typeof saved.alpha === 'number' && Number.isFinite(saved.alpha)) {
            material.uniforms.alpha.value = saved.alpha;
        }
        if (typeof saved.colorMode === 'number' && Number.isFinite(saved.colorMode)) {
            material.uniforms.colorMode.value = saved.colorMode;
        }
        if (typeof saved.vmin === 'number' && Number.isFinite(saved.vmin)) {
            material.uniforms.vmin.value = saved.vmin;
        }
        if (typeof saved.vmax === 'number' && Number.isFinite(saved.vmax)) {
            material.uniforms.vmax.value = saved.vmax;
        }
        if (material.uniforms.clipEnabled && typeof saved.clipEnabled === 'boolean') {
            material.uniforms.clipEnabled.value = saved.clipEnabled ? 1.0 : 0.0;
        }
        if (material.uniforms.clipFlip && typeof saved.clipFlip === 'boolean') {
            material.uniforms.clipFlip.value = saved.clipFlip ? 1.0 : 0.0;
        }
    }

    material.transparent = material.uniforms.alpha.value < 0.99 ||
        material.uniforms.pointType.value > 1.5;
    material.depthWrite = alpha >= 0.99 && pointType !== 'SPHERE';
    cloud.name = 'cloud'; cloud.frustumCulled = false;
    cloud.geometry.computeBoundingBox();
    if (cloud.geometry.boundingBox) {
        const center = new THREE.Vector3(); cloud.geometry.boundingBox.getCenter(center);
        v.cameraCenter.copy(center);
        const size = new THREE.Vector3(); cloud.geometry.boundingBox.getSize(size);
        v.cameraDist = (Math.max(size.x, size.y, size.z) / (2 * Math.tan(v.camera.fov * Math.PI / 360))) * 1.5;
        v.euler = [Math.PI / 3, 0, Math.PI / 4];
        v.updateCamera();
    }
    v.addItem('cloud', cloud);
    if (v.statusElement) v.statusElement.textContent = `${count.toLocaleString()} points`;
    if (v.loadingOverlay) v.loadingOverlay.style.display = 'none';
    v.requestRender();
}

export function resetRealtimeCloud(v: any): void {
    v.removeItem('cloud');
    if (v.statusElement) v.statusElement.textContent = '0 points';
    v.requestRender();
}

export function appendRealtimePoints(v: any, positions: Float32Array, values: Float32Array, rgbColors?: Uint8Array, maxPoints?: number, autoFitOnFirstChunk: boolean = false): void {
    if (positions.length !== values.length * 3) { console.warn('appendRealtimePoints: positions.length must equal values.length * 3'); return; }
    if (rgbColors && rgbColors.length !== values.length * 3) { console.warn('appendRealtimePoints: rgb.length must equal values.length * 3'); return; }
    if (values.length === 0) return;

    let cloud = v.items['cloud'];
    if (!(cloud instanceof CloudItem)) {
        cloud = new CloudItem(new Float32Array(0), new Float32Array(0), { size: 1.0 * window.devicePixelRatio, alpha: 0.1, colorMode: rgbColors ? 'RGB' : 'I' });
        cloud.name = 'cloud'; cloud.frustumCulled = false; v.addItem('cloud', cloud);
    }
    const cloudItem = cloud as CloudItem;
    const beforeCount = cloudItem.getPointCount();
    const count = cloudItem.appendPoints(positions, values, rgbColors, Math.max(1, maxPoints ?? v.realtimeMaxPoints));
    const material = cloudItem.material as CloudShaderMaterial;
    if (beforeCount === 0 && v.savedCloudSettings) {
        const saved = v.savedCloudSettings;
        if (typeof saved.pointSize === 'number' && Number.isFinite(saved.pointSize)) material.uniforms.pointSize.value = saved.pointSize;
        if (typeof saved.pointType === 'number' && Number.isFinite(saved.pointType)) material.uniforms.pointType.value = saved.pointType;
        if (typeof saved.alpha === 'number' && Number.isFinite(saved.alpha)) material.uniforms.alpha.value = saved.alpha;
        if (typeof saved.colorMode === 'number' && Number.isFinite(saved.colorMode)) material.uniforms.colorMode.value = saved.colorMode;
        if (typeof saved.clipEnabled === 'boolean') material.uniforms.clipEnabled.value = saved.clipEnabled ? 1.0 : 0.0;
        if (typeof saved.clipFlip === 'boolean') material.uniforms.clipFlip.value = saved.clipFlip ? 1.0 : 0.0;
    }
    if (rgbColors && !v.savedCloudSettings?.colorMode) material.uniforms.colorMode.value = 1;

    let chunkMin = Infinity, chunkMax = -Infinity;
    for (let i = 0; i < values.length; i++) { const val = values[i]; if (val < chunkMin) chunkMin = val; if (val > chunkMax) chunkMax = val; }
    if (beforeCount === 0 || v.dataMin > v.dataMax) { v.dataMin = chunkMin; v.dataMax = chunkMax; }
    else { if (chunkMin < v.dataMin) v.dataMin = chunkMin; if (chunkMax > v.dataMax) v.dataMax = chunkMax; }
    if (v.dataMin === v.dataMax) { v.dataMin -= 1; v.dataMax += 1; }
    material.uniforms.vmin.value = v.dataMin; material.uniforms.vmax.value = v.dataMax; material.needsUpdate = true;

    if (autoFitOnFirstChunk && beforeCount === 0) {
        cloudItem.geometry.computeBoundingBox();
        if (cloudItem.geometry.boundingBox) {
            const center = new THREE.Vector3(); cloudItem.geometry.boundingBox.getCenter(center); v.cameraCenter.copy(center);
            const size = new THREE.Vector3(); cloudItem.geometry.boundingBox.getSize(size);
            v.cameraDist = (Math.max(size.x, size.y, size.z) / (2 * Math.tan(v.camera.fov * Math.PI / 360))) * 1.5;
            v.euler = [Math.PI / 3, 0, Math.PI / 4]; v.updateCamera();
        }
    }
    if (v.statusElement) v.statusElement.textContent = `${count.toLocaleString()} points (realtime)`;
    if (v.loadingOverlay) v.loadingOverlay.style.display = 'none';
    v.requestRender();
}
