import React from "react";
import { Text, View } from "react-native";
import styles from "./styles";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Open this app in Expo Go</Text>
      <Text style={styles.label}>
        This assignment uses your phone's GPS and a native map. The chapter's
        map library does not display a map in a web browser.
      </Text>
      <Text style={styles.label}>
        Run npm start, then scan the terminal's QR code in Expo Go on your
        Android phone. Allow location access and turn on Location in settings.
      </Text>
    </View>
  );
}
