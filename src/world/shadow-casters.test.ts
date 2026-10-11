import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, Scene } from 'three/webgpu';
import {
  CASTER_RADIUS,
  CasterSweep,
  SHADOW_LAYER,
  SHADOW_MASK,
  casterLayerBits,
  casterRecord,
  casterRadius,
  classifyCaster,
  markShadowMover,
} from './shadow-casters';

const bit = (n: number) => 1 << n;

describe('classifyCaster', () => {
  it('sizes unnamed props by their bounding radius', () => {
    expect(classifyCaster({ path: 'props > Mesh', radius: CASTER_RADIUS.near - 0.01 })).toEqual({
      size: 'none',
      moving: false,
    });
    expect(classifyCaster({ path: 'props > Mesh', radius: 2 }).size).toBe('near');
    expect(classifyCaster({ path: 'props > Mesh', radius: CASTER_RADIUS.far }).size).toBe('far');
  });

  it('keeps buildings in every cascade and drops flat paving and small instanced props', () => {
    expect(classifyCaster({ path: 'anchorage-cay-village > village-wood', radius: 56 })).toEqual({
      size: 'far',
      moving: false,
    });
    expect(classifyCaster({ path: 'port-meridian-town > meridian-town-paving', radius: 212 }).size).toBe(
      'none',
    );
    expect(classifyCaster({ path: 'anchorage-cay-village > village-barrels', radius: 0.9 }).size).toBe(
      'none',
    );
    expect(classifyCaster({ path: 'anchorage-cay-village > village-crates', radius: 0.93 }).size).toBe(
      'near',
    );
    expect(
      classifyCaster({ path: 'puzzle sites > message bottles > message bottles glass', radius: 152 }).size,
    ).toBe('none');
  });

  it('keeps thin merged buckets (rope, metal, signs) to the near cascade', () => {
    expect(classifyCaster({ path: 'anchorage-cay-village > village-rope', radius: 52 }).size).toBe('near');
    expect(classifyCaster({ path: 'port-meridian-town > meridian-town-metal', radius: 210 }).size).toBe(
      'near',
    );
    expect(classifyCaster({ path: 'mill race (P0.1) > mill ironwork', radius: 8 }).size).toBe('near');
    expect(classifyCaster({ path: 'gear rack (Q0.4) > gear rack rope', radius: 0.23 }).size).toBe('none');
  });

  it('marks characters, what they carry, and birds as near movers whatever their bounds say', () => {
    const body = classifyCaster({ path: 'character_nell > Cube117', radius: 137, skinned: true });
    expect(body).toEqual({ size: 'near', moving: true });
    const axe = classifyCaster({ path: 'character_nell > Root > Body > Weapon_DoubleAxe', radius: 0.48 });
    expect(axe).toEqual({ size: 'near', moving: true });
    expect(classifyCaster({ path: 'dock gull > Group > dock gull model', radius: 0.39 })).toEqual({
      size: 'near',
      moving: true,
    });
    expect(classifyCaster({ path: 'Scene > Mesh', radius: 90, skinned: true })).toEqual({
      size: 'near',
      moving: true,
    });
  });

  it('marks ships, the crane arm and its crates as movers, sized by radius', () => {
    expect(classifyCaster({ path: 'brigantine-high > rounded planked hull', radius: 13 })).toEqual({
      size: 'far',
      moving: true,
    });
    expect(classifyCaster({ path: 'brigantine-high > gangway > gangplank', radius: 1.2 })).toEqual({
      size: 'near',
      moving: true,
    });
    expect(
      classifyCaster({ path: 'brigantine-high > standing and running rigging lines', radius: 20 }),
    ).toEqual({
      size: 'near',
      moving: true,
    });
    expect(
      classifyCaster({ path: 'dry-run crane (P0.2) > crane (slewing) > crane timber', radius: 5.3 }),
    ).toEqual({
      size: 'far',
      moving: true,
    });
    expect(classifyCaster({ path: 'dry-run crane (P0.2) > crane base timber', radius: 4 })).toEqual({
      size: 'near',
      moving: false,
    });
    expect(
      classifyCaster({ path: 'moored sloop guild > sloop bobbing hull > sloop wood', radius: 9 }).moving,
    ).toBe(true);
  });

  it('lets a userData hint override the rules', () => {
    expect(
      classifyCaster({ path: 'mill race (P0.1) > Group > Mesh', radius: 1.5, hint: { moving: true } }),
    ).toEqual({
      size: 'near',
      moving: true,
    });
    expect(classifyCaster({ path: 'village-wood', radius: 56, hint: { size: 'none' } }).size).toBe('none');
  });
});

describe('caster layers', () => {
  it('maps classes to layer bits that the cascade masks select', () => {
    const farStatic = casterLayerBits({ size: 'far', moving: false });
    const nearMover = casterLayerBits({ size: 'near', moving: true });
    expect(farStatic).toBe(bit(SHADOW_LAYER.far) | bit(SHADOW_LAYER.static));
    expect(nearMover).toBe(bit(SHADOW_LAYER.mover));
    expect(casterLayerBits({ size: 'none', moving: true })).toBe(0);
    // Near cascades take every caster (layer 0 too); far cascades only large ones.
    expect((1 | farStatic) & SHADOW_MASK.near).not.toBe(0);
    expect((1 | nearMover) & SHADOW_MASK.near).not.toBe(0);
    expect(1 & SHADOW_MASK.near).not.toBe(0);
    expect((1 | farStatic) & SHADOW_MASK.far).not.toBe(0);
    expect((1 | nearMover) & SHADOW_MASK.far).toBe(0);
    expect(1 & SHADOW_MASK.far).toBe(0);
    // The cached map and the dynamic map split static from moving casters.
    expect((1 | farStatic) & SHADOW_MASK.static).not.toBe(0);
    expect((1 | farStatic) & SHADOW_MASK.mover).toBe(0);
    expect((1 | nearMover) & SHADOW_MASK.mover).not.toBe(0);
    expect((1 | nearMover) & SHADOW_MASK.static).toBe(0);
  });
});

describe('CasterSweep', () => {
  const mat = new MeshBasicNodeMaterial();

  function world() {
    const scene = new Scene();
    const village = new Group();
    village.name = 'anchorage-cay-village';
    const wood = new Mesh(new BoxGeometry(40, 10, 40), mat);
    wood.name = 'village-wood';
    const pebble = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), mat);
    pebble.name = 'pebble';
    const wheel = new Mesh(new BoxGeometry(2, 2, 0.5), mat);
    markShadowMover(wheel);
    const quiet = new Mesh(new BoxGeometry(1, 1, 1), mat);
    for (const m of [wood, pebble, wheel]) m.castShadow = true;
    village.add(wood, pebble, wheel, quiet);
    scene.add(village);
    scene.updateMatrixWorld(true);
    return { scene, village, wood, pebble, wheel, quiet };
  }

  it('classifies casters once and writes their layers', () => {
    const { scene, wood, pebble, wheel, quiet } = world();
    const sweep = new CasterSweep();
    expect(sweep.run(scene).added).toBe(3);
    expect(wood.layers.mask).toBe(1 | bit(SHADOW_LAYER.far) | bit(SHADOW_LAYER.static));
    expect(pebble.castShadow).toBe(false);
    expect(wheel.layers.mask).toBe(1 | bit(SHADOW_LAYER.mover));
    expect(casterRecord(quiet)).toBeUndefined();
    expect(sweep.run(scene).added).toBe(0);
  });

  it('puts the layer bits back when something resets the mask', () => {
    const { scene, wood } = world();
    const sweep = new CasterSweep();
    sweep.run(scene);
    wood.layers.mask = 1;
    sweep.run(scene);
    expect(wood.layers.mask & SHADOW_MASK.static).not.toBe(0);
  });

  it('skips meshes staged on the warm layer', () => {
    const { scene, wood } = world();
    wood.layers.set(31);
    new CasterSweep().run(scene);
    expect(casterRecord(wood)).toBeUndefined();
  });

  it('flags the static map stale when a static caster moves or hides, and promotes one that keeps moving', () => {
    const { scene, wood } = world();
    const sweep = new CasterSweep();
    sweep.run(scene, true);
    expect(sweep.run(scene, true).staticChanged).toBe(0);
    wood.position.x += 1;
    scene.updateMatrixWorld(true);
    const once = sweep.run(scene, true);
    expect(once.staticChanged).toBe(1);
    expect(once.promoted).toBe(0);
    expect(sweep.run(scene, true).staticChanged).toBe(0);
    wood.position.x += 1;
    scene.updateMatrixWorld(true);
    sweep.run(scene, true);
    wood.position.x += 1;
    scene.updateMatrixWorld(true);
    expect(sweep.run(scene, true).promoted).toBe(1);
    expect(wood.layers.mask & SHADOW_MASK.mover).not.toBe(0);
    expect(wood.layers.mask & SHADOW_MASK.static).toBe(0);
  });

  it('notices a hidden ancestor', () => {
    const { scene, village } = world();
    const sweep = new CasterSweep();
    sweep.run(scene, true);
    village.visible = false;
    expect(sweep.run(scene, true).staticChanged).toBe(1);
    expect(sweep.run(scene, true).staticChanged).toBe(0);
  });
});

describe('casterRadius', () => {
  it('uses the largest single instance for instanced meshes', () => {
    const inst = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicNodeMaterial(), 3);
    inst.setMatrixAt(0, new Matrix4().makeTranslation(100, 0, 0));
    inst.setMatrixAt(1, new Matrix4().makeScale(2, 2, 2));
    inst.setMatrixAt(2, new Matrix4().makeTranslation(-100, 0, 0));
    inst.updateMatrixWorld(true);
    expect(casterRadius(inst)).toBeCloseTo(Math.sqrt(3), 5);
  });
});
