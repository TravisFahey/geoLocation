import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "ghostwhite",
  },
  mapView: {
    alignSelf: "stretch",
    height: 450,
    flexShrink: 1,
    margin: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  label: {
    textAlign: "center",
    marginHorizontal: 30,
    marginVertical: 6,
  },
  credit: {
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
});
