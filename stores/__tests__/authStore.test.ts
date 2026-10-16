import useAuthStore from "../authStore";
import { api } from "@/services/api";
import { LoginCredentialsManager } from "@/services/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
jest.mock("@/services/api", () => ({
  api: { baseURL: "http://test.invalid", setSessionRestorer: jest.fn(), login: jest.fn(), logout: jest.fn() },
}));
jest.mock("@/services/storage", () => ({ LoginCredentialsManager: { get: jest.fn() } }));
jest.mock("../settingsStore", () => ({
  useSettingsStore: { getState: () => ({ serverConfig: { StorageType: "localstorage" } }) },
  getServerConfigPromise: jest.fn(),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock("react-native-toast-message", () => ({ show: jest.fn() }));
jest.mock("@/utils/Logger", () => ({ withTag: () => ({ error: jest.fn(), warn: jest.fn() }) }));
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ isLoggedIn: false, authenticatedBaseUrl: null, isLoginModalVisible: false });
});
test("password-only MoonTV session can be restored without a username", async () => {
  (LoginCredentialsManager.get as jest.Mock).mockResolvedValue({ username: "", password: "test-only" });
  (api.login as jest.Mock).mockResolvedValue({ ok: true });
  await useAuthStore.getState().restoreSession();
  expect(api.login).toHaveBeenCalledWith(undefined, "test-only");
  expect(useAuthStore.getState().isLoginModalVisible).toBe(false);
  expect(useAuthStore.getState().isLoggedIn).toBe(true);
});
test("refresh after successful login does not reopen login if Set-Cookie is unavailable to JS", async () => {
  useAuthStore.setState({ isLoggedIn: true, authenticatedBaseUrl: api.baseURL, isLoginModalVisible: false });
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  await useAuthStore.getState().checkLoginStatus(api.baseURL);
  expect(api.login).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isLoginModalVisible).toBe(false);
});
test("failed session restoration prompts for login and clears stale cookie marker", async () => {
  (LoginCredentialsManager.get as jest.Mock).mockResolvedValue({ username: "", password: "test-only" });
  (api.login as jest.Mock).mockRejectedValue(new Error("UNAUTHORIZED"));
  await useAuthStore.getState().restoreSession();
  expect(useAuthStore.getState().isLoggedIn).toBe(false);
  expect(useAuthStore.getState().isLoginModalVisible).toBe(true);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith("authCookies");
});
