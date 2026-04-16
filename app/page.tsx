"use client";

import { useState, useEffect, useRef } from "react";
import { useGeolocated } from "react-geolocated";
import { getTargetCoordinates } from "./actions";

import "./App.css";

// Helper to calculate bearing from current location to target
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const toDeg = (rad: number) => (rad * 180) / Math.PI;

	const phi1 = toRad(lat1);
	const phi2 = toRad(lat2);
	const deltaLambda = toRad(lon2 - lon1);

	const y = Math.sin(deltaLambda) * Math.cos(phi2);
	const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
	const theta = Math.atan2(y, x);

	return (toDeg(theta) + 360) % 360;
}

export default function CipherCompass() {
	const { coords, isGeolocationAvailable, isGeolocationEnabled } = useGeolocated({
		positionOptions: {
			enableHighAccuracy: true,
		},
		userDecisionTimeout: 5000,
		watchPosition: true,
	});

	const [heading, setHeading] = useState<number | null>(null);
	const [targetBearing, setTargetBearing] = useState<number>(0);
	const [errorMsg, setErrorMsg] = useState("");
	const [started, setStarted] = useState(false);
	const [isSpinning, setIsSpinning] = useState(false);
	const [mounted, setMounted] = useState(false);
	const currentRotationRef = useRef<number>(180); // Start pointing upwards (180deg offset due to image alignment)

	const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number } | null>(null);

	// Next.js Server Action poller
	useEffect(() => {
		setMounted(true);
		let isMounted = true;

		async function fetchCoords() {
			try {
				const coordsData = await getTargetCoordinates();
				if (isMounted) setTargetCoords(coordsData);
			} catch (err) {
				console.error("Failed to fetch coordinates via Server Action", err);
			}
		}

		fetchCoords();
		const interval = setInterval(fetchCoords, 5000);

		return () => {
			isMounted = false;
			clearInterval(interval);
		};
	}, []);

	// Update the target bearing when location changes
	useEffect(() => {
		if (coords && targetCoords) {
			const bearing = calculateBearing(coords.latitude, coords.longitude, targetCoords.lat, targetCoords.lng);
			setTargetBearing(bearing);
		}
	}, [coords, targetCoords]);

	// Request compass permissions and attach event listeners
	const handleOrientation = (e: Event) => {
		const orientationEvent = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
		let currentHeading = 0;

		if (orientationEvent.webkitCompassHeading !== undefined) {
			// iOS compass heading
			currentHeading = orientationEvent.webkitCompassHeading;
		} else if (orientationEvent.alpha !== null) {
			// Android / standard compass heading (alpha is left-hand rotation from north)
			currentHeading = 360 - orientationEvent.alpha;
		} else {
			return; // No compass sensory data
		}

		setHeading(currentHeading);
	};

	const startCompass = async () => {
		if (started) return;
		setStarted(true);
		setErrorMsg("");

		if (!isGeolocationAvailable || !isGeolocationEnabled) {
			alert("Abilita la geolocalizzazione per usare la bussola.");
			return;
		}

		const win = window as any;
		let permissionGranted = true;

		// Handle iOS 13+ device orientation permission
		if (typeof (DeviceOrientationEvent as any) !== "undefined" && typeof (DeviceOrientationEvent as any).requestPermission === "function") {
			try {
				const response = await (DeviceOrientationEvent as any).requestPermission();
				if (response === "granted") {
					win.addEventListener("deviceorientation", handleOrientation as any, true);
				} else {
					setErrorMsg("Permesso per l'orientamento del dispositivo negato.");
					permissionGranted = false;
				}
			} catch (error) {
				setErrorMsg("Errore durante la richiesta dei permessi di orientamento: " + error);
				permissionGranted = false;
			}
		} else {
			// Non-iOS devices (Standard Android/Desktop)
			if ("ondeviceorientationabsolute" in window) {
				win.addEventListener("deviceorientationabsolute", handleOrientation as any, true);
			} else if ("ondeviceorientation" in window) {
				win.addEventListener("deviceorientation", handleOrientation as any, true);
			} else {
				setErrorMsg("API di orientamento del dispositivo non supportata in questo browser.");
				permissionGranted = false;
			}
		}

		if (permissionGranted) {
			// Start spinning animation
			setIsSpinning(true);
			// 4 full spins = 1440 degrees added to the current value
			currentRotationRef.current += 1440;

			// Let it spin for 3 seconds before restoring snappy responses
			setTimeout(() => {
				setIsSpinning(false);
			}, 3000);
		}
	};

	// We offset by 180 degrees because the image naturally points downwards on the screen at 0 degrees!
	const rawRotationToTarget = started ? targetBearing - (heading || 0) : 0; // Sit facing directly up before starting (180deg)

	let diff = (rawRotationToTarget - currentRotationRef.current) % 360;
	if (diff > 180) diff -= 360;
	else if (diff < -180) diff += 360;

	currentRotationRef.current += diff;

	const compassCircleTransformStyle = `translate(-50%, -50%) translate(0, 2.5%) rotate(${currentRotationRef.current}deg)`;
	// Slow, smooth transition during spins; standard tracking transition otherwise (from CSS)
	const dynamicTransition = isSpinning ? "transform 3s cubic-bezier(0.25, 1, 0.5, 1)" : undefined;

	return (
		<div className="App">
			<div>
				{started && (
					<pre className="text-sm mt-10" style={{ color: "#fff" }}>
						Direzione Target: {targetBearing.toFixed(2)}°{"\n"}
						Direzione Attuale: {heading !== null ? heading.toFixed(2) + "°" : "N/D"}
						{"\n"}
						Coordinate attuali: {coords ? `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}` : "N/D"}
						{"\n"}
						Coordinate target: {targetCoords ? `${targetCoords.lat.toFixed(6)}, ${targetCoords.lng.toFixed(6)}` : "N/D"}
						{"\n"}
					</pre>
				)}
			</div>
			{errorMsg && <div style={{ color: "red", fontWeight: "bold" }}>{errorMsg}</div>}
			<div
				onClick={startCompass}
				className="compass cursor-pointer"
				style={{
					opacity: mounted ? 1 : 0,
					transform: `translate(-50%, -50%) scale(${mounted ? 1 : 0})`,
					transition: "opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
				}}
			>
				<div
					className="compass-circle"
					style={{
						transform: compassCircleTransformStyle,
						...(dynamicTransition ? { transition: dynamicTransition } : {}),
					}}
				/>
				{!started && (
					<span className="absolute -bottom-4 -translate-x-1/2 translate-y-full font-serif font-semibold w-full text-white drop-shadow-md">
						Clicca la bussola per iniziare
					</span>
				)}
			</div>
		</div>
	);
}
