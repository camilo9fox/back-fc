/**
 * Unit tests — AuthService
 * Uses mocked authRepository and categoryService.
 * Does NOT call Supabase or issue real JWTs to external services.
 */

// Set JWT env vars before any module loads config
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-unit-tests";

const AuthService = require("../../../src/modules/auth/services/AuthService");
const jwt = require("jsonwebtoken");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
} = require("../../../src/shared/errors/AppError");

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_USER_ID = "user-test-001";
const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "Password1";

const baseUser = {
  id: VALID_USER_ID,
  email: VALID_EMAIL,
  metadata: { tokenVersion: 0, full_name: "Test User" },
};

function buildService(repoOverrides = {}, categoryOverrides = {}) {
  const authRepository = {
    signUp: jest.fn().mockResolvedValue({ user: baseUser }),
    signIn: jest.fn().mockResolvedValue({ user: baseUser }),
    signOut: jest.fn().mockResolvedValue(true),
    getUserById: jest.fn().mockResolvedValue(baseUser),
    updateUser: jest.fn().mockResolvedValue(baseUser),
    resetPassword: jest.fn().mockResolvedValue(true),
    deleteAccount: jest.fn().mockResolvedValue(true),
    verifySession: jest.fn().mockResolvedValue(baseUser),
    updatePassword: jest.fn().mockResolvedValue(true),
    signInWithOAuth: jest
      .fn()
      .mockResolvedValue({ url: "https://oauth.example.com" }),
    ...repoOverrides,
  };
  const categoryService = {
    createCategory: jest.fn().mockResolvedValue({}),
    ...categoryOverrides,
  };
  return {
    service: new AuthService(authRepository, categoryService),
    authRepository,
    categoryService,
  };
}

// ── signUp ────────────────────────────────────────────────────────────────────

describe("AuthService.signUp()", () => {
  it("returns user, token and refreshToken on success", async () => {
    const { service } = buildService();
    const result = await service.signUp(VALID_EMAIL, VALID_PASSWORD);
    expect(result.user).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it("creates the default General category after sign up", async () => {
    const { service, categoryService } = buildService();
    await service.signUp(VALID_EMAIL, VALID_PASSWORD);
    expect(categoryService.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ title: "General" }),
    );
  });

  it("still succeeds when default category creation fails", async () => {
    const { service } = buildService(
      {},
      { createCategory: jest.fn().mockRejectedValue(new Error("DB error")) },
    );
    const result = await service.signUp(VALID_EMAIL, VALID_PASSWORD);
    expect(result.user).toBeDefined();
  });

  it("throws ValidationError for invalid email", async () => {
    const { service } = buildService();
    await expect(
      service.signUp("not-an-email", VALID_PASSWORD),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for short password", async () => {
    const { service } = buildService();
    await expect(service.signUp(VALID_EMAIL, "abc")).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for password without uppercase", async () => {
    const { service } = buildService();
    await expect(service.signUp(VALID_EMAIL, "password1")).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for password without number", async () => {
    const { service } = buildService();
    await expect(service.signUp(VALID_EMAIL, "Password")).rejects.toThrow(
      ValidationError,
    );
  });

  it("strips non-allowlisted metadata fields", async () => {
    const { service, authRepository } = buildService();
    await service.signUp(VALID_EMAIL, VALID_PASSWORD, {
      full_name: "Alice",
      role: "admin", // not in allowlist
    });
    const calledMetadata = authRepository.signUp.mock.calls[0][2];
    expect(calledMetadata.full_name).toBe("Alice");
    expect(calledMetadata.role).toBeUndefined();
  });
});

// ── signIn ────────────────────────────────────────────────────────────────────

describe("AuthService.signIn()", () => {
  it("returns user, token and refreshToken", async () => {
    const { service } = buildService();
    const result = await service.signIn(VALID_EMAIL, VALID_PASSWORD);
    expect(result.token).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it("throws ValidationError for invalid email", async () => {
    const { service } = buildService();
    await expect(service.signIn("bad-email", VALID_PASSWORD)).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError when password is empty", async () => {
    const { service } = buildService();
    await expect(service.signIn(VALID_EMAIL, "")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── signOut ───────────────────────────────────────────────────────────────────

describe("AuthService.signOut()", () => {
  it("calls authRepository.signOut and returns true", async () => {
    const { service, authRepository } = buildService();
    const result = await service.signOut(VALID_USER_ID);
    expect(authRepository.signOut).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result).toBe(true);
  });

  it("throws ValidationError when userId is empty", async () => {
    const { service } = buildService();
    await expect(service.signOut("")).rejects.toThrow(ValidationError);
  });
});

// ── getUserById ───────────────────────────────────────────────────────────────

describe("AuthService.getUserById()", () => {
  it("returns user data", async () => {
    const { service } = buildService();
    const result = await service.getUserById(VALID_USER_ID);
    expect(result).toEqual(baseUser);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.getUserById("")).rejects.toThrow(ValidationError);
  });
});

// ── resetPassword ─────────────────────────────────────────────────────────────

describe("AuthService.resetPassword()", () => {
  it("delegates to repository and returns true", async () => {
    const { service, authRepository } = buildService();
    const result = await service.resetPassword(VALID_EMAIL);
    expect(authRepository.resetPassword).toHaveBeenCalledWith(VALID_EMAIL);
    expect(result).toBe(true);
  });

  it("throws ValidationError for invalid email", async () => {
    const { service } = buildService();
    await expect(service.resetPassword("not-email")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── updateProfile ─────────────────────────────────────────────────────────────

describe("AuthService.updateProfile()", () => {
  it("updates name in metadata", async () => {
    const { service, authRepository } = buildService();
    await service.updateProfile(VALID_USER_ID, { name: "Bob" });
    expect(authRepository.updateUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({
        metadata: expect.objectContaining({ full_name: "Bob" }),
      }),
    );
  });

  it("validates and updates email", async () => {
    const { service, authRepository } = buildService();
    await service.updateProfile(VALID_USER_ID, { email: "new@example.com" });
    expect(authRepository.updateUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ email: "new@example.com" }),
    );
  });

  it("throws ValidationError for invalid new email", async () => {
    const { service } = buildService();
    await expect(
      service.updateProfile(VALID_USER_ID, { email: "bad-email" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.updateProfile("", { name: "X" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws NotFoundError when user does not exist", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.updateProfile(VALID_USER_ID, { name: "X" }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── updatePassword ────────────────────────────────────────────────────────────

describe("AuthService.updatePassword()", () => {
  it("updates password successfully", async () => {
    const { service } = buildService();
    const result = await service.updatePassword(
      VALID_USER_ID,
      VALID_PASSWORD,
      "NewPass1",
    );
    expect(result).toBe(true);
  });

  it("throws ValidationError for wrong current password", async () => {
    const { service } = buildService({
      signIn: jest.fn().mockRejectedValue(new Error("invalid credentials")),
    });
    await expect(
      service.updatePassword(VALID_USER_ID, "WrongPass1", "NewPass1"),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when new password is too weak", async () => {
    const { service } = buildService();
    await expect(
      service.updatePassword(VALID_USER_ID, VALID_PASSWORD, "weak"),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.updatePassword("", VALID_PASSWORD, "NewPass1"),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when currentPassword is empty", async () => {
    const { service } = buildService();
    await expect(
      service.updatePassword(VALID_USER_ID, "", "NewPass1"),
    ).rejects.toThrow(ValidationError);
  });
});

// ── deleteAccount ─────────────────────────────────────────────────────────────

describe("AuthService.deleteAccount()", () => {
  it("delegates to repository", async () => {
    const { service, authRepository } = buildService();
    const result = await service.deleteAccount(VALID_USER_ID);
    expect(authRepository.deleteAccount).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result).toBe(true);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.deleteAccount("")).rejects.toThrow(ValidationError);
  });
});

// ── signInWithOAuth ───────────────────────────────────────────────────────────

describe("AuthService.signInWithOAuth()", () => {
  it("returns oauth URL for valid provider", async () => {
    const { service } = buildService();
    const result = await service.signInWithOAuth("google");
    expect(result.url).toBeDefined();
  });

  it("throws ValidationError for unsupported provider", async () => {
    const { service } = buildService();
    await expect(service.signInWithOAuth("facebook")).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for invalid redirectTo URL", async () => {
    const { service } = buildService();
    await expect(
      service.signInWithOAuth("google", "https://evil.com/redirect"),
    ).rejects.toThrow(ValidationError);
  });
});

// ── refreshSession ────────────────────────────────────────────────────────────

describe("AuthService.refreshSession()", () => {
  it("throws ValidationError when no token provided", async () => {
    const { service } = buildService();
    await expect(service.refreshSession(null)).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid/expired token", async () => {
    const { service } = buildService();
    await expect(service.refreshSession("invalid.token.here")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── revokeRefreshToken ────────────────────────────────────────────────────────

describe("AuthService.revokeRefreshToken()", () => {
  it("does not throw when called with a token", () => {
    const { service } = buildService();
    expect(() => service.revokeRefreshToken("some.token.value")).not.toThrow();
  });

  it("does nothing when called with empty string", () => {
    const { service } = buildService();
    expect(() => service.revokeRefreshToken("")).not.toThrow();
  });
});

// ── getOnboardingProfile ──────────────────────────────────────────────────────

describe("AuthService.getOnboardingProfile()", () => {
  it("returns null when user has no onboardingProfile", async () => {
    const { service } = buildService();
    const result = await service.getOnboardingProfile(VALID_USER_ID);
    expect(result).toBeNull();
  });

  it("returns the onboardingProfile from metadata", async () => {
    const profile = { dailyTime: "10-15" };
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue({
        ...baseUser,
        metadata: { tokenVersion: 0, onboardingProfile: profile },
      }),
    });
    const result = await service.getOnboardingProfile(VALID_USER_ID);
    expect(result).toEqual(profile);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.getOnboardingProfile("")).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── updateOnboardingProfile ───────────────────────────────────────────────────

describe("AuthService.updateOnboardingProfile()", () => {
  it("saves and returns the new profile", async () => {
    const { service, authRepository } = buildService();
    const result = await service.updateOnboardingProfile(VALID_USER_ID, {
      dailyTime: "10-15",
    });
    expect(result.dailyTime).toBe("10-15");
    expect(authRepository.updateUser).toHaveBeenCalled();
  });

  it("sets completedAt when introSeen is true", async () => {
    const { service } = buildService();
    const result = await service.updateOnboardingProfile(VALID_USER_ID, {
      introSeen: true,
    });
    expect(result.completedAt).toBeDefined();
  });

  it("throws ValidationError for invalid dailyTime", async () => {
    const { service } = buildService();
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { dailyTime: "invalid" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid preferredFormat", async () => {
    const { service } = buildService();
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        preferredFormat: "videos",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid weeklyGoalDays", async () => {
    const { service } = buildService();
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { weeklyGoalDays: 4 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(service.updateOnboardingProfile("", {})).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── verifyToken ───────────────────────────────────────────────────────────────

describe("AuthService.verifyToken()", () => {
  it("returns null when token is null", async () => {
    const { service } = buildService();
    const result = await service.verifyToken(null);
    expect(result).toBeNull();
  });

  it("returns null for an invalid token (catches jwt.verify error)", async () => {
    const { service } = buildService();
    const result = await service.verifyToken("bad.token.here");
    expect(result).toBeNull();
  });

  it("returns user when token is valid and user exists with matching id", async () => {
    const { service } = buildService();
    // Sign a real JWT that will pass jwt.verify()
    const token = jwt.sign(
      { userId: VALID_USER_ID, email: VALID_EMAIL },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const result = await service.verifyToken(token);
    expect(result).toMatchObject({ id: VALID_USER_ID });
  });

  it("returns null when verifySession returns user with different id", async () => {
    const differentUser = {
      id: "different-user",
      email: VALID_EMAIL,
      metadata: {},
    };
    const { service } = buildService({
      verifySession: jest.fn().mockResolvedValue(differentUser),
    });
    const token = jwt.sign(
      { userId: VALID_USER_ID, email: VALID_EMAIL },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const result = await service.verifyToken(token);
    expect(result).toBeNull();
  });

  it("returns null when verifySession returns null", async () => {
    const { service } = buildService({
      verifySession: jest.fn().mockResolvedValue(null),
    });
    const token = jwt.sign(
      { userId: VALID_USER_ID, email: VALID_EMAIL },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const result = await service.verifyToken(token);
    expect(result).toBeNull();
  });
});

// ── refreshSession — success path ─────────────────────────────────────────────

describe("AuthService.refreshSession() — success path", () => {
  it("returns new tokens and user when refresh token is valid", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(baseUser),
    });
    // Generate a real refresh token
    const refreshToken = jwt.sign(
      { userId: VALID_USER_ID, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );
    const result = await service.refreshSession(refreshToken);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toBeDefined();
  });

  it("throws NotFoundError when user does not exist", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    const refreshToken = jwt.sign(
      { userId: VALID_USER_ID, tokenVersion: 99 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );
    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ValidationError when tokenVersion does not match", async () => {
    const { service } = buildService({
      // user has tokenVersion=2 but token claims version=0
      getUserById: jest.fn().mockResolvedValue({
        ...baseUser,
        metadata: { tokenVersion: 2 },
      }),
    });
    const refreshToken = jwt.sign(
      { userId: VALID_USER_ID, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );
    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── revokeRefreshToken — with real JWT ────────────────────────────────────────

describe("AuthService.revokeRefreshToken() — real token", () => {
  it("stores token hash in revoked set (no error)", () => {
    const { service } = buildService();
    const refreshToken = jwt.sign(
      { userId: VALID_USER_ID, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );
    // Should not throw
    expect(() => service.revokeRefreshToken(refreshToken)).not.toThrow();
  });

  it("makes subsequent refreshSession throw ValidationError (revoked)", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(baseUser),
    });
    const refreshToken = jwt.sign(
      { userId: VALID_USER_ID, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );
    service.revokeRefreshToken(refreshToken);
    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── getOnboardingProfile — NotFoundError ─────────────────────────────────────

describe("AuthService.getOnboardingProfile() — not found", () => {
  it("throws NotFoundError when user does not exist", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    await expect(service.getOnboardingProfile(VALID_USER_ID)).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ── updateOnboardingProfile — NotFoundError ───────────────────────────────────

describe("AuthService.updateOnboardingProfile() — not found", () => {
  it("throws NotFoundError when user does not exist", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── _validateOnboardingProfile — additional branches ─────────────────────────

describe("AuthService._validateOnboardingProfile() — extended branches", () => {
  let service;
  beforeEach(() => {
    ({ service } = buildService());
  });

  it("throws ValidationError when goals is not an array", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { goals: "learn" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when studyLevel is invalid", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { studyLevel: "expert" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when sessionPreference is invalid", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        sessionPreference: "weekend",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when challengeAreas is not an array", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        challengeAreas: "math",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when examDate is a number (not string)", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { examDate: 12345 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when examDate is invalid date string", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        examDate: "not-a-date",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when recommendedPath does not start with /", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        recommendedPath: "flashcards",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when introSeen is not boolean", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { introSeen: 1 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when completedAt is a number", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { completedAt: 999 }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when completedAt is an invalid date string", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, {
        completedAt: "bad-date",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when skipped is not boolean", async () => {
    await expect(
      service.updateOnboardingProfile(VALID_USER_ID, { skipped: 0 }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts valid recommendedPath starting with /", async () => {
    const { service: svc } = buildService();
    const result = await svc.updateOnboardingProfile(VALID_USER_ID, {
      recommendedPath: "/flashcards",
    });
    expect(result.recommendedPath).toBe("/flashcards");
  });

  it("accepts valid examDate ISO string", async () => {
    const { service: svc } = buildService();
    const result = await svc.updateOnboardingProfile(VALID_USER_ID, {
      examDate: "2025-12-01T00:00:00Z",
    });
    expect(result.examDate).toBe("2025-12-01T00:00:00Z");
  });
});

// ── _getTokenVersion — edge cases ─────────────────────────────────────────────

describe("AuthService._getTokenVersion() edge cases", () => {
  it("returns 0 when metadata.tokenVersion is negative", () => {
    const { service } = buildService();
    const user = { ...baseUser, metadata: { tokenVersion: -1 } };
    expect(service._getTokenVersion(user)).toBe(0);
  });

  it("returns 0 when metadata.tokenVersion is a non-integer float", () => {
    const { service } = buildService();
    const user = { ...baseUser, metadata: { tokenVersion: 1.5 } };
    expect(service._getTokenVersion(user)).toBe(0);
  });

  it("returns 0 when metadata is undefined", () => {
    const { service } = buildService();
    expect(service._getTokenVersion({})).toBe(0);
  });
});

// ── _incrementTokenVersion — user not found ───────────────────────────────────

describe("AuthService._incrementTokenVersion() — user not found", () => {
  it("throws NotFoundError when user does not exist", async () => {
    const { service } = buildService({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    await expect(service._incrementTokenVersion(VALID_USER_ID)).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ── _sanitizeRegistrationMetadata — array input ───────────────────────────────

describe("AuthService._sanitizeRegistrationMetadata() — array input", () => {
  it("returns {} when metadata is an array", () => {
    const { service } = buildService();
    const result = service._sanitizeRegistrationMetadata(["role", "admin"]);
    expect(result).toEqual({});
  });

  it("returns {} when metadata is null", () => {
    const { service } = buildService();
    const result = service._sanitizeRegistrationMetadata(null);
    expect(result).toEqual({});
  });

  it("signUp with array metadata treats as empty metadata", async () => {
    const { service } = buildService();
    // Should not throw — array metadata is sanitized to {}
    const result = await service.signUp(VALID_EMAIL, VALID_PASSWORD, ["admin"]);
    expect(result.user).toBeDefined();
  });
});
