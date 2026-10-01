// Just enough EXIF parsing to show the "location from photo" badge before
// upload. The server reads EXIF itself; this is only for the preview.

export async function readGps(file) {
	try {
		const buf = await file.slice(0, 256 * 1024).arrayBuffer();
		return parseJpegGps(new DataView(buf));
	} catch {
		return null;
	}
}

function parseJpegGps(view) {
	if (view.getUint16(0) !== 0xffd8) return null;
	let off = 2;
	while (off + 4 < view.byteLength) {
		const marker = view.getUint16(off);
		const size = view.getUint16(off + 2);
		if (marker === 0xffe1 && view.getUint32(off + 4) === 0x45786966) return parseTiff(view, off + 10);
		if ((marker & 0xff00) !== 0xff00) return null;
		off += 2 + size;
	}
	return null;
}

function parseTiff(view, start) {
	const little = view.getUint16(start) === 0x4949;
	const u16 = (o) => view.getUint16(start + o, little);
	const u32 = (o) => view.getUint32(start + o, little);
	const ifd0 = u32(4);
	let gpsOffset = null;
	const n = u16(ifd0);
	for (let i = 0; i < n; i++) {
		const e = ifd0 + 2 + i * 12;
		if (u16(e) === 0x8825) gpsOffset = u32(e + 8);
	}
	if (gpsOffset === null) return null;
	const tags = {};
	const m = u16(gpsOffset);
	for (let i = 0; i < m; i++) {
		const e = gpsOffset + 2 + i * 12;
		const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
		if (type === 2) tags[tag] = String.fromCharCode(view.getUint8(start + e + 8));
		if (type === 5 && count === 3) {
			const p = u32(e + 8);
			const r = (k) => u32(p + k * 8) / (u32(p + k * 8 + 4) || 1);
			tags[tag] = r(0) + r(1) / 60 + r(2) / 3600;
		}
	}
	if (tags[2] === undefined || tags[4] === undefined) return null;
	const lat = tags[2] * (tags[1] === "S" ? -1 : 1);
	const lon = tags[4] * (tags[3] === "W" ? -1 : 1);
	if (!lat && !lon) return null;
	return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
}
