import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readSkeletonJson, Pose } from '../../../vendor/rigby2d/src/core/index.js';
import { createVolumetricLid, createVolumetricSpine, bakeVolumetricLid } from './volumetric_lid.mjs';

const config = {
  dimensions: { width: 1000, depth: 377.5163706332757, thickness: 50 },
  segments: [8, 1, 4], viewport: [1448, 1086], origin: [724, 970], hingeSource: [725, 491],
  camera: { position: [0, 674.399525447008, 1311.663173587851], target: [0, -310.38015696622807, 0], fov: 48.558137101341764, near: 1, far: 10000 },
};
const lid = createVolumetricLid(config);
assert.ok(lid.geometry instanceof THREE.BoxGeometry);
assert.ok(lid.hinge instanceof THREE.Group);
assert.ok(lid.camera instanceof THREE.PerspectiveCamera);
assert.equal(lid.geometry.groups.length, 6);
assert.equal(lid.controls.length, 90);
assert.equal(new Set(lid.faces.map((face) => face.material)).size, 3);
const materials = {
  lid_outer: { image: 'lid_outer', width: 1921, height: 482 },
  lid_inner: { image: 'lid_inner', width: 974, height: 252 },
  lid_edge: { image: 'lid_edge', width: 828, height: 64 },
};
const rig = createVolumetricSpine({ lid, materials });
const edgeAngle = THREE.MathUtils.radToDeg(Math.atan2(config.camera.position[1], config.camera.position[2]));
const initial = lid.evaluate(0);
const edge = lid.evaluate(edgeAngle);
const opened = lid.evaluate(100);
const threePoses = [initial, edge, opened, lid.evaluate(108)];
const width = (pose, left, right) => pose.corners[right].source[0] - pose.corners[left].source[0];
const centerY = (pose, left, right) => (pose.corners[right].source[1] + pose.corners[left].source[1]) / 2;
const calibrationActual = {
  hingeWidth: width(initial, 'bottomRearLeft', 'bottomRearRight'),
  closedWidth: width(initial, 'bottomFrontLeft', 'bottomFrontRight'),
  closedDrop: centerY(initial, 'bottomFrontLeft', 'bottomFrontRight') - centerY(initial, 'bottomRearLeft', 'bottomRearRight'),
  openWidth: width(opened, 'bottomFrontLeft', 'bottomFrontRight'),
  openRise: centerY(opened, 'bottomRearLeft', 'bottomRearRight') - centerY(opened, 'bottomFrontLeft', 'bottomFrontRight'),
};
const calibrationTargets = { hingeWidth: 828, closedWidth: 1045, closedDrop: 183, openWidth: 972, openRise: 341 };
const calibrationResidual = Object.fromEntries(Object.entries(calibrationActual).map(([name, actual]) => [name, actual - calibrationTargets[name]]));
assert.ok(['hingeWidth', 'closedWidth', 'closedDrop'].every((name) => Math.abs(calibrationResidual[name]) < 1e-3));
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const triangleArea = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const poseReports = threePoses.map((pose) => {
  assert.ok(pose.controls.every((control) => [...control.world, ...control.source].every(Number.isFinite)));
  assert.ok(pose.faces.every((face, i) => !i || face.depth >= pose.faces[i - 1].depth));
  for (const [upper, lower] of [['topRearLeft', 'bottomRearLeft'], ['topRearRight', 'bottomRearRight'], ['topFrontLeft', 'bottomFrontLeft'], ['topFrontRight', 'bottomFrontRight']]) {
    assert.ok(Math.abs(distance(pose.corners[upper].world, pose.corners[lower].world) - config.dimensions.thickness) < 1e-6);
  }
  for (const rear of ['bottomRearLeft', 'bottomRearRight']) {
    assert.ok(distance(pose.corners[rear].world, initial.corners[rear].world) < 1e-3, `${rear} must remain on the hinge axis`);
    assert.ok(distance(pose.corners[rear].source, initial.corners[rear].source) < 1e-3, `${rear} drifted from the box-mouth rear edge`);
  }
  const faceAreas = Object.fromEntries(lid.faces.map((face) => [face.name, Math.abs(face.triangles.reduce((sum, _, i) => i % 3 ? sum : sum + triangleArea(...face.triangles.slice(i, i + 3).map((vertex) => pose.controls[face.controlIndices[vertex]].source)), 0))]));
  assert.ok(pose.visibleFaces.length > 0);
  return { angle: pose.angleDegrees, visibleFaces: pose.visibleFaces, depthOrder: pose.faces.map(({ name, depth, visible, facing }) => ({ name, depth, visible, facing })), faceAreas, corners: Object.fromEntries(Object.entries(pose.corners).map(([name, control]) => [name, control.source])) };
});
assert.ok(!edge.visibleFaces.includes('lid_top'));
assert.ok(!edge.visibleFaces.includes('lid_bottom'));
assert.ok(edge.visibleFaces.includes('lid_front'));
assert.ok(poseReports[1].faceAreas.lid_front > 10000, 'Edge-on solid front surface must remain visible');
const front = lid.faces.find((face) => face.face === 'front');
const edgeY = front.controlIndices.map((i) => edge.controls[i].source[1]);
const edgeOnThicknessPixels = Math.max(...edgeY) - Math.min(...edgeY);
assert.ok(edgeOnThicknessPixels > 20, `Thickness vanished edge-on: ${edgeOnThicknessPixels}px`);
const samples = Array.from({ length: 217 }, (_, i) => ({ time: i / 60, angle: i / 2 }));
const baked = bakeVolumetricLid({ lid, samples });
const bottomFace = lid.faces.find((face) => face.face === 'bottom');
for (const sample of baked.poses) {
  assert.ok(bottomFace.controlIndices.every((i) => sample.controls[i].world[1] >= -1e-3), 'Inner surface must stay above the box-mouth plane while opening');
  for (const corner of ['bottomRearLeft', 'bottomRearRight']) {
    assert.ok(Math.abs(sample.corners[corner].world[1]) < 1e-3 && Math.abs(sample.corners[corner].world[2]) < 1e-3, 'Inner rear edge must stay on the physical hinge axis');
  }
}
const json = {
  skeleton: { spine: '3.8.99' }, bones: [{ name: 'root' }, ...rig.bones], slots: rig.slots,
  skins: [{ name: 'default', attachments: rig.attachments }],
  animations: { open: {
    bones: baked.bones, slots: baked.slots,
    draworder: baked.faceOrders.map((order) => ({ time: order.time, offsets: rig.slots.map((slot, i) => ({ slot: slot.name, offset: order.names.indexOf(slot.name) - i })) })),
  } },
};
const { skeleton, warnings } = readSkeletonJson(json, 'three-volumetric-lid');
assert.deepEqual(warnings, []);
const pose = new Pose(skeleton);
let maxSpinePositionError = 0;
let checkedVertices = 0;
for (const [i, sample] of samples.entries()) {
  pose.reset(skeleton);
  pose.apply(skeleton, skeleton.animation('open'), sample.time, 1);
  pose.updateWorld(skeleton);
  assert.deepEqual(pose.drawOrder.map((slot) => skeleton.slots[slot].name), baked.faceOrders[i].names);
  const drawables = pose.quads(skeleton);
  assert.deepEqual(drawables.map((drawable) => skeleton.slots[drawable.slot].name), baked.poses[i].visibleFaces);
  for (const drawable of drawables) {
    const face = lid.faces.find((candidate) => candidate.name === skeleton.slots[drawable.slot].name);
    assert.equal(drawable.positions.length, face.controlIndices.length);
    assert.equal(drawable.triangles.length / 3, 2 * drawable.positions.length - face.hull - 2);
    drawable.positions.forEach((position, vertex) => {
      maxSpinePositionError = Math.max(maxSpinePositionError, distance(position, baked.poses[i].controls[face.controlIndices[vertex]].spine));
      checkedVertices++;
    });
  }
}
assert.ok(maxSpinePositionError < 1e-6);
console.log(JSON.stringify({ passed: true, primitives: lid.primitives, config, calibrationTargets, calibrationActual, calibrationResidual, calibrationScope: 'Closed bottom is fitted to the box-mouth plane. Open reference differences are reported; camera was retained after moving the physical hinge.', threePoses: poseReports, edgeOnThicknessPixels, editableControls: rig.bones.length, completeFaces: rig.slots.length, spineFrames: samples.length, checkedVertices, maxSpinePositionError, faceLayouts: rig.faceLayouts.map(({ name, material, boneIndices, triangles, hull }) => ({ name, material, vertices: boneIndices.length, triangles: triangles.length / 3, hull })) }, null, 2));
