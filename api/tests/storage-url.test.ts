import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicStorageUrl } from '../src/lib/storageUrl';

test('Docker storage URLs use the public origin and path prefix', () => {
  const oldInternal = process.env.SUPABASE_URL;
  const oldExternal = process.env.SUPABASE_PUBLIC_URL;
  try {
    process.env.SUPABASE_URL = 'http://gateway:8000/';
    process.env.SUPABASE_PUBLIC_URL = 'https://voca.sethmccarthy.in/supabase/';
    const path = '/storage/v1/object/public/voca-media/user/word/audio.mp3';
    assert.equal(publicStorageUrl(`http://gateway:8000${path}`), `https://voca.sethmccarthy.in/supabase${path}`);
    assert.equal(publicStorageUrl(`https://unrelated.test${path}`), `https://unrelated.test${path}`);
    delete process.env.SUPABASE_PUBLIC_URL;
    assert.equal(publicStorageUrl(`http://gateway:8000${path}`), `http://gateway:8000${path}`);
    process.env.SUPABASE_PUBLIC_URL = 'https://user:secret@voca.sethmccarthy.in';
    assert.throws(() => publicStorageUrl(`http://gateway:8000${path}`), /without credentials/);
  } finally {
    if (oldInternal === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldInternal;
    if (oldExternal === undefined) delete process.env.SUPABASE_PUBLIC_URL;
    else process.env.SUPABASE_PUBLIC_URL = oldExternal;
  }
});
