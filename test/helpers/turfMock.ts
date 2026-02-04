export const point = ([lng, lat]: [number, number]) => ({
	type: 'Feature',
	geometry: {type: 'Point', coordinates: [lng, lat]},
});

export const bboxPolygon = () => ({
	geometry: {type: 'Polygon', coordinates: []},
});

export const featureCollection = (features: unknown[]) => ({
	type: 'FeatureCollection',
	features,
});

export const convex = () => null;
