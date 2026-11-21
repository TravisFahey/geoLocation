import React, { useEffect, useState } from "react";
import { ActivityIndicator, Button, StatusBar, Text, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import styles from "./styles";
import { withTimeout } from "./withTimeout";

StatusBar.setBarStyle("dark-content");

export default function App() {
  const [position, setPosition] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [message, setMessage] = useState("Finding your location...");
  const [request, setRequest] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let active = true;
    let watcher;
    let timeout;
    const controller = new AbortController();

    function updatePosition({ coords: { latitude, longitude } }) {
      if (active) {
        setPosition({ latitude, longitude });
      }
    }

    async function findRestaurant({ latitude, longitude }) {
      if (!active) return;
      setMessage("Looking for a restaurant within 3 km...");

      const query = `[out:json][timeout:20];nwr["amenity"="restaurant"]["name"](around:3000,${latitude},${longitude});out center;`;
      timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "GeoLocationChapter21/1.0 (educational map assignment)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Restaurant service returned HTTP ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data.elements) || data.remark) {
          throw new Error("Restaurant lookup was incomplete");
        }

        const place = data.elements.find((element) => {
          const coordinate = element.center || element;
          return element.tags?.name &&
            Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon);
        });

        if (!active) return;
        if (!place) {
          setMessage("No named restaurant was found within 3 km. Try again in another area.");
          return;
        }

        const coordinate = place.center || place;
        setRestaurant({
          title: place.tags.name,
          description: place.tags.cuisine
            ? `Cuisine: ${place.tags.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}`
            : "A nearby restaurant",
          coordinate: { latitude: coordinate.lat, longitude: coordinate.lon },
        });
        setMessage("Tap the restaurant marker for details.");
      } catch (error) {
        if (active) {
          setMessage(controller.signal.aborted
            ? "Restaurant search timed out. Try again."
            : `Could not load restaurants. ${error?.message || ""} Check your connection and try again.`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    (async () => {
      setPosition(null);
      setRestaurant(null);
      setMessage("Finding your location...");
      setLocating(true);
      setPermissionGranted(false);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== "granted") {
          setMessage("Location permission was denied. Enable it in your phone settings, then try again.");
          return;
        }
        setPermissionGranted(true);
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!active) return;
        if (!servicesEnabled) {
          setMessage("Location services are off. Turn on Location in your phone settings, then try again.");
          return;
        }

        setMessage("Getting your location (up to 20 seconds)...");
        const location = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          20000,
          "No GPS fix after 20 seconds. Enable Google Location Accuracy or move outdoors, then try again."
        );
        if (!active) return;
        updatePosition(location);
        setLocating(false);
        findRestaurant(location.coords);
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 },
          updatePosition,
          () => {
            if (active) setMessage("Location updates stopped. Check GPS and try again.");
          }
        );
        if (!active) watcher.remove();
      } catch (error) {
        if (active) {
          setMessage(`Could not get your location. ${error?.message || "Check location access and try again."}`);
        }
      } finally {
        if (active) setLocating(false);
      }
    })();

    return () => {
      active = false;
      watcher?.remove();
      controller.abort();
      clearTimeout(timeout);
    };
  }, [request]);

  const destination = restaurant?.coordinate || position;
  const region = position && {
    latitude: (position.latitude + destination.latitude) / 2,
    longitude: (position.longitude + destination.longitude) / 2,
    latitudeDelta: Math.max(0.01, Math.abs(position.latitude - destination.latitude) * 2),
    longitudeDelta: Math.max(0.01, Math.abs(position.longitude - destination.longitude) * 2),
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nearby Restaurant</Text>
      <Text style={styles.label}>{restaurant?.title || "Your current location"}</Text>
      <MapView
        style={styles.mapView}
        region={region || undefined}
        showsPointsOfInterests={false}
        showsUserLocation={permissionGranted}
      >
        {restaurant && (
          <Marker
            title={restaurant.title}
            description={restaurant.description}
            coordinate={restaurant.coordinate}
          />
        )}
      </MapView>
      {locating && <ActivityIndicator accessibilityLabel="Finding your location" />}
      <Text style={styles.label} accessibilityLiveRegion="polite">{message}</Text>
      <Button title="Try again" onPress={() => setRequest(request + 1)} />
      <Text style={styles.credit}>Restaurant data: © OpenStreetMap contributors</Text>
    </View>
  );
}
