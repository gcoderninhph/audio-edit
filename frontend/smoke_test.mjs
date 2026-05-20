import { getNativeEncodePlan } from './electron/export/nativeFfmpeg.mjs';

async function test() {
  try {
    const plan = await getNativeEncodePlan('default-profile');
    console.log(JSON.stringify({
      encoder: plan.encoder || 'unknown',
      audioPresent: !!plan.audioArgs,
      size: plan.targetSize || 'auto'
    }));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
}
test();
