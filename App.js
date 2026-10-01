import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
} from "react-native";

import * as Location from "expo-location";

const SecureStore =
  Platform.OS === "web"
    ? {
        getItemAsync: async (k) => localStorage.getItem(k),
        setItemAsync: async (k, v) => localStorage.setItem(k, v),
        deleteItemAsync: async (k) => localStorage.removeItem(k),
      }
    : require("expo-secure-store");

const TOKEN_KEY = "session_token";
const USER_KEY = "session_user";

// ----------  (usuario: ana / clave: 1234) ----------
const USERS = {
  ana: { password: "1234", name: "Ana Pérez", email: "ana@correo.com" },
};

function fakeLoginApi(username, password) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const u = USERS[username.trim().toLowerCase()];
      if (u && u.password === password) {
        resolve({
          token: "token-" + Date.now(),
          user: { name: u.name, email: u.email },
        });
      } else {
        reject(new Error("Usuario o contraseña incorrectos"));
      }
    }, 600);
  });
}

// ---------- Estado global: Context API + useReducer ----------
const AuthContext = createContext(null);

function authReducer(state, action) {
  switch (action.type) {
    case "RESTORE":
      return { loading: false, token: action.token, user: action.user };
    case "LOGIN":
      return { loading: false, token: action.token, user: action.user };
    case "LOGOUT":
      return { loading: false, token: null, user: null };
    default:
      return state;
  }
}

function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, {
    loading: true,
    token: null,
    user: null,
  });

  // Al abrir la app: recuperar la sesión guardada de forma segura
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        const userJson = await SecureStore.getItemAsync(USER_KEY);
        dispatch({
          type: "RESTORE",
          token,
          user: userJson ? JSON.parse(userJson) : null,
        });
      } catch (e) {
        dispatch({ type: "RESTORE", token: null, user: null });
      }
    })();
  }, []);

  const login = async (username, password) => {
    const { token, user } = await fakeLoginApi(username, password);
    await SecureStore.setItemAsync(TOKEN_KEY, token); // token cifrado por el sistema
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    dispatch({ type: "LOGIN", token, user });
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    dispatch({ type: "LOGOUT" });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onLogin = async () => {
    setError("");
    if (!username || !password) {
      setError("Escribe tu usuario y contraseña.");
      return;
    }
    setBusy(true);
    try {
      await login(username, password);
    } catch (e) {
      setError(e.message); // "Usuario o contraseña incorrectos"
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar sesión</Text>
      <TextInput
        style={styles.input}
        placeholder="Usuario"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Entrar" onPress={onLogin} />
      )}
    </View>
  );
}
// ---------- Pantalla principal (solo se puede acceder con sesión) ----------
function HomeScreen() {
  const { user, logout } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [coords, setCoords] = useState(null);
  const subscription = useRef(null);

  const stopTracking = () => {
    if (subscription.current) {
      subscription.current.remove(); // detiene el GPS
      subscription.current = null;
    }
    setTracking(false);
  };

  // El permiso se pide SOLO cuando el usuario toca el botón
  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permiso denegado",
        "Sin ubicación no podemos mostrar tu posición, pero puedes seguir usando la app.",
      );
      return;
    }
    subscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        timeInterval: 10000,
      },
      (loc) => setCoords(loc.coords),
    );
    setTracking(true);
  };

  // Detener el GPS si la app pasa a segundo plano
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") stopTracking();
    });
    return () => sub.remove();
  }, []);

  // Detener el GPS al salir al cerrar sesión
  useEffect(() => () => stopTracking(), []);

  const onLogout = async () => {
    stopTracking();
    await logout();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola, {user?.name}</Text>
      <Text style={styles.text}>Correo: {user?.email}</Text>

      <View style={styles.box}>
        <Text style={styles.text}>
          {coords
            ? `Lat: ${coords.latitude.toFixed(5)}\nLon: ${coords.longitude.toFixed(5)}`
            : "Ubicación no activada"}
        </Text>
        <Button
          title={tracking ? "Detener ubicación" : "Activar ubicación"}
          onPress={tracking ? stopTracking : startTracking}
        />
      </View>

      <Button title="Cerrar sesión" color="#c0392b" onPress={onLogout} />
    </View>
  );
}

// -------- sin token no se ve la pantalla principal ----------
function Root() {
  const { loading, token } = useAuth();
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  return token ? <HomeScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 8 },
  text: { fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  box: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    gap: 10,
    marginVertical: 12,
  },
});
