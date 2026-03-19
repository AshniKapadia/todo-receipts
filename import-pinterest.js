#!/usr/bin/env node
// One-time Pinterest import script
// Usage: node import-pinterest.js <path-to-pins-html> <board-name> <list-type>
// Example: node import-pinterest.js /tmp/pinterest-import/pins/0001.html "stuff i wanna make" make

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const pinsFile  = process.argv[2] || '/tmp/pinterest-import/pins/0001.html';
const boardName = (process.argv[3] || 'stuff i wanna make').toLowerCase();
const listType  = process.argv[4] || 'make';
const BASE_URL  = process.env.IMPORT_URL || 'http://localhost:3000';

console.log(`\nPinterest Import`);
console.log(`Board: "${boardName}" → list type: "${listType}"`);
console.log(`Target: ${BASE_URL}\n`);

const html = await readFile(pinsFile, 'utf-8');

// Split into pin blocks by the repeated pattern
const pinBlocks = html.split(/(?=\s*Title:)/);

const pins = [];
for (const block of pinBlocks) {
  const boardMatch = block.match(/Board Name:\s*([^\n<]+)/i);
  if (!boardMatch) continue;
  if (boardMatch[1].trim().toLowerCase() !== boardName) continue;

  const titleMatch   = block.match(/Title:\s*([^\n<]+)/i);
  const imageMatch   = block.match(/Image:\s*([a-f0-9]{32})/i);
  const linkMatch    = block.match(/Canonical Link:.*?href="([^"]+)"/is);

  const title = titleMatch && titleMatch[1].trim() !== 'No data' ? titleMatch[1].trim() : '';
  const imageHash = imageMatch ? imageMatch[1].trim() : null;
  const sourceUrl = linkMatch ? linkMatch[1].trim() : '';

  if (!imageHash && !sourceUrl) continue;

  pins.push({ title, imageHash, sourceUrl });
}

console.log(`Found ${pins.length} pins in "${boardName}"\n`);

let success = 0, failed = 0;

for (let i = 0; i < pins.length; i++) {
  const pin = pins[i];
  process.stdout.write(`[${i + 1}/${pins.length}] ${pin.title || pin.sourceUrl || 'untitled'}... `);

  try {
    let imageFilename = null;

    // Try to fetch image from Pinterest CDN
    if (pin.imageHash) {
      const h = pin.imageHash;
      const cdnUrl = `https://i.pinimg.com/originals/${h.slice(0,2)}/${h.slice(2,4)}/${h.slice(4,6)}/${h}.jpg`;
      try {
        const imgRes = await fetch(cdnUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          // Save via the server's upload endpoint
          const b64 = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + buffer.toString('base64');
          // We'll send it as imageData in the create call below
          pin.imageData = b64;
        }
      } catch {
        // CDN fetch failed — will still create entry with URL only
      }
    }

    // If image CDN failed, try OG fetch from source URL
    if (!pin.imageData && pin.sourceUrl) {
      try {
        const ogRes = await fetch(`${BASE_URL}/api/wishlist/fetch-og`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pin.sourceUrl }),
          signal: AbortSignal.timeout(12000),
        });
        const ogData = await ogRes.json();
        if (ogData.success && ogData.filename) {
          imageFilename = ogData.filename;
        }
      } catch {
        // OG fetch also failed — create without image
      }
    }

    // Create the wishlist item
    const body = {
      listType,
      title: pin.title,
      sourceUrl: pin.sourceUrl,
      user: 'ashni',
    };
    if (pin.imageData) body.imageData = pin.imageData;
    if (imageFilename)  body.imageFilename = imageFilename;

    const res = await fetch(`${BASE_URL}/api/wishlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const hasImg = pin.imageData || imageFilename;
      console.log(`✓${hasImg ? ' (image)' : ' (no image)'}`);
      success++;
    } else {
      console.log(`✗ server error ${res.status}`);
      failed++;
    }
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }

  // Small delay to avoid hammering the server
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\nDone! ${success} imported, ${failed} failed.`);
