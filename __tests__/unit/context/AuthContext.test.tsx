import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { AuthProvider, useAuth } from "@/context/AuthContext";

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
}));

const mockOnAuthStateChanged = onAuthStateChanged as jest.MockedFunction<
  typeof onAuthStateChanged
>;
const mockFirebaseSignOut = firebaseSignOut as jest.MockedFunction<
  typeof firebaseSignOut
>;

const mockUser = {
  uid: "user-1",
  email: "test@example.com",
  displayName: "Test User",
};

let authCallback: ((user: unknown) => void) | null = null;
let mockUnsubscribe: jest.Mock;

beforeEach(() => {
  authCallback = null;
  mockUnsubscribe = jest.fn();
  mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
    authCallback = callback as (user: unknown) => void;
    return mockUnsubscribe;
  });
  mockFirebaseSignOut.mockResolvedValue();
});

afterEach(() => {
  jest.clearAllMocks();
});

function AuthConsumer() {
  const { user, loading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="user-email">{user?.email ?? "no-user"}</span>
      <span data-testid="loading">{loading ? "loading" : "done"}</span>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("starts with loading=true and user=null before Firebase resolves", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("loading");
    expect(screen.getByTestId("user-email")).toHaveTextContent("no-user");
  });

  it("sets user and loading=false when Firebase resolves with a user", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback!(mockUser);
    });

    expect(screen.getByTestId("loading")).toHaveTextContent("done");
    expect(screen.getByTestId("user-email")).toHaveTextContent(
      "test@example.com"
    );
  });

  it("sets user=null and loading=false when Firebase resolves with null (logged out)", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback!(null);
    });

    expect(screen.getByTestId("loading")).toHaveTextContent("done");
    expect(screen.getByTestId("user-email")).toHaveTextContent("no-user");
  });

  it("clears user when Firebase emits null after a user was set", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback!(mockUser);
    });
    expect(screen.getByTestId("user-email")).toHaveTextContent(
      "test@example.com"
    );

    act(() => {
      authCallback!(null);
    });
    expect(screen.getByTestId("user-email")).toHaveTextContent("no-user");
  });

  it("calls the unsubscribe function when the provider unmounts", () => {
    const { unmount } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("calls onAuthStateChanged exactly once on mount", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
  });
});

describe("signOut", () => {
  it("calls Firebase signOut when invoked", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback!(mockUser);
    });

    await user.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(mockFirebaseSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("useAuth", () => {
  it("provides default values when used outside a provider", () => {
    function Standalone() {
      const { user, loading } = useAuth();
      return (
        <span data-testid="val">
          {loading ? "loading" : user?.email ?? "none"}
        </span>
      );
    }
    render(<Standalone />);
    // Default context: loading=true, user=null
    expect(screen.getByTestId("val")).toHaveTextContent("loading");
  });
});
