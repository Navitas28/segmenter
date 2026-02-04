let loaderPromise: Promise<void> | null = null;

export const loadGoogleMaps = (apiKey: string) => {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Window not available'));
	}

	if (loaderPromise) {
		return loaderPromise;
	}

	loaderPromise = new Promise<void>((resolve, reject) => {
		if ((window as typeof window & {google?: unknown}).google) {
			resolve();
			return;
		}

		const script = document.createElement('script');
		const libraries = ['visualization', 'marker'];
		script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=${libraries.join(',')}`;
		script.async = true;
		script.defer = true;
		script.onload = () => {
			resolve();
		};
		script.onerror = () => {
			reject(new Error('Failed to load Google Maps API'));
		};
		document.head.appendChild(script);
	});

	return loaderPromise;
};
