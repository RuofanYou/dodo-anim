import * as THREE from 'three';

export const VOLUMETRIC_LID_PRIMITIVES = {
  package: 'three@0.186.1', revision: THREE.REVISION,
  geometry: 'THREE.BoxGeometry', hinge: 'THREE.Group.rotateX',
  camera: 'THREE.PerspectiveCamera', projection: 'THREE.Vector3.project',
  normals: 'THREE.Matrix3.getNormalMatrix', depth: 'THREE.Camera.matrixWorldInverse',
};
const FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'];
const round = (value) => Number(value.toFixed(8));
const finitePair = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const bilinear = (corners, u, v) => [0, 1].map((i) => (1 - u) * (1 - v) * corners[0][i] + u * (1 - v) * corners[1][i] + u * v * corners[2][i] + (1 - u) * v * corners[3][i]);

/**
 * Box bottom is y=0, top is y=thickness and rear is z=0. The rear lower edge is
 * the X hinge at the box-mouth plane; positive angles rotate the Group by negative X.
 */
export function createVolumetricLid(config) {
  const { width, depth, thickness } = config.dimensions;
  if (![width, depth, thickness].every((v) => Number.isFinite(v) && v > 0)) throw new Error('Lid width/depth/thickness must be positive finite dimensions');
  const segments = config.segments ?? [8, 1, 4];
  if (!Array.isArray(segments) || segments.length !== 3 || !segments.every((v) => Number.isSafeInteger(v) && v >= 1)) throw new Error('Lid segments must be [width,height,depth] positive cell counts');
  const viewport = config.viewport ?? [1448, 1086];
  const origin = config.origin ?? [724, 970];
  const hingeSource = config.hingeSource ?? [725, 491];
  if (![viewport, origin, hingeSource].every(finitePair) || viewport.some((v) => v <= 0)) throw new Error('viewport/origin/hingeSource must be finite 2D coordinates');
  const cameraConfig = config.camera;
  const camera = new THREE.PerspectiveCamera(cameraConfig.fov, viewport[0] / viewport[1], cameraConfig.near ?? 1, cameraConfig.far ?? 100000);
  camera.position.fromArray(cameraConfig.position);
  camera.lookAt(new THREE.Vector3().fromArray(cameraConfig.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const hingeProjection = new THREE.Vector3(0, 0, 0).project(camera);
  const geometry = new THREE.BoxGeometry(width, thickness, depth, ...segments);
  geometry.translate(0, thickness / 2, depth / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const hinge = new THREE.Group();
  hinge.add(mesh);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const controls = [];
  const unique = new Map();
  const sourceControl = new Map();
  for (let i = 0; i < positions.count; i++) {
    const local = new THREE.Vector3().fromBufferAttribute(positions, i);
    const key = local.toArray().join(',');
    if (!unique.has(key)) {
      unique.set(key, controls.length);
      controls.push({ name: `${config.bonePrefix ?? 'lid_3d_'}${String(controls.length).padStart(3, '0')}`, local });
    }
    sourceControl.set(i, unique.get(key));
  }
  const faces = geometry.groups.map((group) => {
    const sourceIndices = [...new Set(Array.from({ length: group.count }, (_, j) => index.getX(group.start + j)))];
    const parameters = (i) => [uv.getX(i), 1 - uv.getY(i)];
    const boundaryRank = (i) => {
      const [u, v] = parameters(i);
      if (v === 0) return u;
      if (u === 1) return 1 + v;
      if (v === 1) return 3 - u;
      if (u === 0) return 4 - v;
      return 5 + v + u / 100;
    };
    sourceIndices.sort((a, b) => boundaryRank(a) - boundaryRank(b));
    const toLocal = new Map(sourceIndices.map((value, i) => [value, i]));
    const hull = sourceIndices.filter((i) => { const [u, v] = parameters(i); return u === 0 || u === 1 || v === 0 || v === 1; }).length;
    const faceName = FACE_NAMES[group.materialIndex];
    const localCenter = sourceIndices.reduce((center, i) => center.add(new THREE.Vector3().fromBufferAttribute(positions, i)), new THREE.Vector3()).multiplyScalar(1 / sourceIndices.length);
    return {
      name: `lid_${faceName}`, face: faceName, material: faceName === 'top' ? 'lid_outer' : faceName === 'bottom' ? 'lid_inner' : 'lid_edge',
      controlIndices: sourceIndices.map((i) => sourceControl.get(i)),
      parameters: sourceIndices.map(parameters),
      triangles: Array.from({ length: group.count }, (_, j) => toLocal.get(index.getX(group.start + j))),
      hull, localCenter, localNormal: new THREE.Vector3().fromBufferAttribute(normals, sourceIndices[0]),
    };
  });
  const cornerCoordinates = {
    topRearLeft: [-width / 2, thickness, 0], topRearRight: [width / 2, thickness, 0],
    topFrontRight: [width / 2, thickness, depth], topFrontLeft: [-width / 2, thickness, depth],
    bottomRearLeft: [-width / 2, 0, 0], bottomRearRight: [width / 2, 0, 0],
    bottomFrontRight: [width / 2, 0, depth], bottomFrontLeft: [-width / 2, 0, depth],
  };
  const cornerIndices = Object.fromEntries(Object.entries(cornerCoordinates).map(([name, local]) => {
    const expected = new THREE.Vector3().fromArray(local);
    const found = controls.findIndex((control) => control.local.distanceTo(expected) < 1e-3);
    if (found < 0) throw new Error(`THREE.BoxGeometry corner ${name} is missing`);
    return [name, found];
  }));
  function evaluate(angleDegrees) {
    if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 180) throw new Error('Opening angle must be in [0,180] degrees');
    hinge.rotation.set(0, 0, 0);
    hinge.rotateX(-THREE.MathUtils.degToRad(angleDegrees));
    hinge.updateMatrixWorld(true);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const projected = controls.map((control) => {
      const world = control.local.clone().applyMatrix4(mesh.matrixWorld);
      const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
      if (view.z >= -camera.near) throw new Error(`Lid point ${control.name} crossed the camera near plane at ${angleDegrees} degrees`);
      const ndc = world.clone().project(camera);
      const source = [hingeSource[0] + (ndc.x - hingeProjection.x) * viewport[0] / 2, hingeSource[1] - (ndc.y - hingeProjection.y) * viewport[1] / 2];
      return { name: control.name, world: world.toArray(), view: view.toArray(), source, spine: [source[0] - origin[0], origin[1] - source[1]] };
    });
    const evaluatedFaces = faces.map((face) => {
      const center = face.localCenter.clone().applyMatrix4(mesh.matrixWorld);
      const normal = face.localNormal.clone().applyNormalMatrix(normalMatrix);
      const cameraRay = camera.position.clone().sub(center).normalize();
      const facing = normal.dot(cameraRay);
      return { name: face.name, face: face.face, material: face.material, visible: facing > 1e-7, facing, depth: center.clone().applyMatrix4(camera.matrixWorldInverse).z, normal: normal.toArray() };
    }).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
    return {
      angleDegrees, controls: projected, faces: evaluatedFaces,
      faceOrder: evaluatedFaces.map((face) => face.name),
      visibleFaces: evaluatedFaces.filter((face) => face.visible).map((face) => face.name),
      corners: Object.fromEntries(Object.entries(cornerIndices).map(([name, i]) => [name, projected[i]])),
    };
  }
  return { config, controls, faces, cornerIndices, camera, geometry, hinge, mesh, evaluate, primitives: VOLUMETRIC_LID_PRIMITIVES };
}

/** Each unique actual 3D surface vertex gets one projected control, shared across faces. */
export function createVolumetricSpine({ lid, materials, parent = 'root', boneIndexOffset = 1, setupAngle = 0 }) {
  if (!Number.isSafeInteger(boneIndexOffset) || boneIndexOffset < 0) throw new Error('boneIndexOffset must be a nonnegative skeleton index');
  const setup = lid.evaluate(setupAngle);
  const bones = setup.controls.map((control) => ({ name: control.name, parent, x: round(control.spine[0]), y: round(control.spine[1]) }));
  const visible = new Set(setup.visibleFaces);
  const slots = [];
  const attachments = {};
  const faceLayouts = [];
  for (const face of lid.faces) {
    const material = materials[face.material];
    if (!material || !(material.width > 0) || !(material.height > 0) || !material.image) throw new Error(`Missing PNG metadata for ${face.material}`);
    const uvCorners = material.uvCorners ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (uvCorners.length !== 4 || uvCorners.some((p) => !finitePair(p) || p.some((v) => v < 0 || v > 1))) throw new Error(`Invalid UV corners for ${face.material}`);
    const boneIndices = face.controlIndices.map((i) => boneIndexOffset + i);
    const attachment = {
      type: 'mesh', path: material.image, width: material.width, height: material.height,
      uvs: face.parameters.flatMap(([u, v]) => bilinear(uvCorners, u, v)),
      triangles: face.triangles.slice(), hull: face.hull,
      vertices: boneIndices.flatMap((i) => [1, i, 0, 0, 1]),
    };
    slots.push({ name: face.name, bone: parent, ...(visible.has(face.name) ? { attachment: face.name } : {}) });
    attachments[face.name] = { [face.name]: attachment };
    faceLayouts.push({ name: face.name, material: face.material, image: material.image, boneIndices, uvs: attachment.uvs, triangles: attachment.triangles, hull: attachment.hull });
  }
  return { bones, slots, attachments, faceLayouts };
}

export function bakeVolumetricLid({ lid, samples, setupAngle = 0 }) {
  if (!Array.isArray(samples) || samples.length < 2 || samples[0].time !== 0 || samples.some((sample, i) => !Number.isFinite(sample.time) || sample.time < 0 || (i && sample.time <= samples[i - 1].time))) throw new Error('Samples require ascending times and an explicit time:0');
  const setup = lid.evaluate(setupAngle);
  const poses = samples.map(({ time, angle }) => ({ time, ...lid.evaluate(angle) }));
  const bones = Object.fromEntries(lid.controls.map((control, i) => [control.name, { translate: poses.map((pose) => ({ time: pose.time, x: round(pose.controls[i].spine[0] - setup.controls[i].spine[0]), y: round(pose.controls[i].spine[1] - setup.controls[i].spine[1]) })) }]));
  const slots = Object.fromEntries(lid.faces.map((face) => [face.name, { attachment: poses.map((pose) => ({ time: pose.time, name: pose.visibleFaces.includes(face.name) ? face.name : null })) }]));
  return { bones, slots, faceOrders: poses.map(({ time, faceOrder, visibleFaces }) => ({ time, names: faceOrder, visibleFaces })), poses };
}
