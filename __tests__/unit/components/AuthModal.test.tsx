import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  GoogleAuthProvider,
} from "firebase/auth";
import AuthModal from "@/components/auth/AuthModal";

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

jest.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  updateProfile: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({})),
}));

const mockSignIn = signInWithEmailAndPassword as jest.MockedFunction<
  typeof signInWithEmailAndPassword
>;
const mockCreateUser = createUserWithEmailAndPassword as jest.MockedFunction<
  typeof createUserWithEmailAndPassword
>;
const mockSignInWithPopup = signInWithPopup as jest.MockedFunction<
  typeof signInWithPopup
>;
const mockUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;

const mockOnClose = jest.fn();
const defaultProps = {
  open: true,
  onClose: mockOnClose,
  accentColor: "#16a34a",
};

const mockFirebaseUser = {
  uid: "user-1",
  email: "test@example.com",
  displayName: null,
};

/** The form submit button always has type="submit". The mode-switch tabs do not. */
function getSubmitButton() {
  return document.querySelector('button[type="submit"]') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Visibility ──────────────────────────────────────────────────────────────

describe("visibility", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<AuthModal {...defaultProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the modal when open=true", () => {
    render(<AuthModal {...defaultProps} />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });
});

// ─── Mode toggle ─────────────────────────────────────────────────────────────

describe("mode toggle", () => {
  it('defaults to "signin" mode with "Welcome back" heading', () => {
    render(<AuthModal {...defaultProps} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome back");
  });

  it('shows "Create account" heading in signup mode', async () => {
    const user = userEvent.setup();
    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Create account");
  });

  it("shows Full Name field only in signup mode", async () => {
    const user = userEvent.setup();
    render(<AuthModal {...defaultProps} />);

    expect(screen.queryByPlaceholderText("Juan dela Cruz")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.getByPlaceholderText("Juan dela Cruz")).toBeInTheDocument();
  });

  it("clears error message when switching modes", async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValueOnce({ code: "auth/invalid-credential", message: "" });

    render(<AuthModal {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(getSubmitButton());

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.queryByText("Incorrect email or password.")).not.toBeInTheDocument();
  });
});

// ─── Sign-in ─────────────────────────────────────────────────────────────────

describe("sign-in flow", () => {
  it("calls signInWithEmailAndPassword with the entered credentials", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>);

    render(<AuthModal {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "mypassword");
    await user.click(getSubmitButton());

    expect(mockSignIn).toHaveBeenCalledWith(
      expect.anything(),
      "user@test.com",
      "mypassword"
    );
  });

  it("calls onClose after successful sign-in", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>);

    render(<AuthModal {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "u@t.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(getSubmitButton());

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Sign-up ─────────────────────────────────────────────────────────────────

describe("sign-up flow", () => {
  it("calls createUserWithEmailAndPassword and updateProfile with display name", async () => {
    const user = userEvent.setup();
    mockCreateUser.mockResolvedValueOnce({
      user: { ...mockFirebaseUser, updateProfile: jest.fn() },
    } as unknown as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);
    mockUpdateProfile.mockResolvedValueOnce(undefined);

    render(<AuthModal {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("Juan dela Cruz"), "Ana Reyes");
    await user.type(screen.getByPlaceholderText("you@example.com"), "ana@test.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "password123");
    await user.click(getSubmitButton()); // "Create Account" button

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.anything(),
      "ana@test.com",
      "password123"
    );
    expect(mockUpdateProfile).toHaveBeenCalledWith(expect.anything(), {
      displayName: "Ana Reyes",
    });
  });

  it("does not call updateProfile when name field is blank", async () => {
    const user = userEvent.setup();
    mockCreateUser.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);

    render(<AuthModal {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass123");
    await user.click(getSubmitButton());

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("calls onClose after successful sign-up", async () => {
    const user = userEvent.setup();
    mockCreateUser.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);

    render(<AuthModal {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass123");
    await user.click(getSubmitButton());

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

describe("Google sign-in", () => {
  it("calls signInWithPopup with a GoogleAuthProvider instance", async () => {
    const user = userEvent.setup();
    mockSignInWithPopup.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof signInWithPopup>>);

    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
  });

  it("calls onClose after successful Google sign-in", async () => {
    const user = userEvent.setup();
    mockSignInWithPopup.mockResolvedValueOnce({
      user: mockFirebaseUser,
    } as unknown as Awaited<ReturnType<typeof signInWithPopup>>);

    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Error messages ───────────────────────────────────────────────────────────

describe("Firebase error messages", () => {
  async function triggerSignInError(code: string) {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValueOnce({ code, message: "" });

    render(<AuthModal {...defaultProps} />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "p");
    await user.click(getSubmitButton());
  }

  it("shows human-readable message for auth/invalid-credential", async () => {
    await triggerSignInError("auth/invalid-credential");
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  it("shows human-readable message for auth/email-already-in-use", async () => {
    const user = userEvent.setup();
    mockCreateUser.mockRejectedValueOnce({
      code: "auth/email-already-in-use",
      message: "",
    });

    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "dup@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText("An account with this email already exists.")
    ).toBeInTheDocument();
  });

  it("shows human-readable message for auth/weak-password", async () => {
    const user = userEvent.setup();
    mockCreateUser.mockRejectedValueOnce({
      code: "auth/weak-password",
      message: "",
    });

    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "x@y.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "123");
    await user.click(getSubmitButton());

    expect(
      await screen.findByText("Password must be at least 6 characters.")
    ).toBeInTheDocument();
  });

  it("shows human-readable message for auth/invalid-email", async () => {
    await triggerSignInError("auth/invalid-email");
    expect(
      await screen.findByText("Please enter a valid email address.")
    ).toBeInTheDocument();
  });

  it("shows human-readable message for auth/too-many-requests", async () => {
    await triggerSignInError("auth/too-many-requests");
    expect(
      await screen.findByText("Too many attempts. Please try again later.")
    ).toBeInTheDocument();
  });

  it("shows NO visible error for auth/popup-closed-by-user", async () => {
    const user = userEvent.setup();
    mockSignInWithPopup.mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
      message: "",
    });

    render(<AuthModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    // Wait for async to settle
    await screen.findByRole("heading");
    // The error message maps to empty string — no error element is rendered
    expect(document.querySelector(".text-red-500")).not.toBeInTheDocument();
  });

  it("shows fallback message for unmapped Firebase error codes", async () => {
    await triggerSignInError("auth/some-unknown-error");
    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
  });

  it("does not call onClose when sign-in fails", async () => {
    await triggerSignInError("auth/invalid-credential");
    await screen.findByText("Incorrect email or password.");
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});

// ─── Closing the modal ───────────────────────────────────────────────────────

describe("closing", () => {
  it("calls onClose when the X (close) button is clicked", async () => {
    const user = userEvent.setup();
    render(<AuthModal {...defaultProps} />);
    // The X button is the only button in the modal with the `p-2` padding class
    const xBtn = document.querySelector("button.p-2") as HTMLElement;
    expect(xBtn).not.toBeNull();
    await user.click(xBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<AuthModal {...defaultProps} />);
    const backdrop = document.querySelector(".backdrop-blur-sm") as Element;
    await user.click(backdrop);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Loading state ───────────────────────────────────────────────────────────

describe("loading state", () => {
  it('shows "Please wait…" on the submit button while sign-in is in progress', async () => {
    const user = userEvent.setup();
    mockSignIn.mockImplementationOnce(() => new Promise(() => {})); // never resolves

    render(<AuthModal {...defaultProps} />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(getSubmitButton());

    const submitBtn = getSubmitButton();
    expect(submitBtn).toHaveTextContent("Please wait…");
    expect(submitBtn).toBeDisabled();
  });
});
