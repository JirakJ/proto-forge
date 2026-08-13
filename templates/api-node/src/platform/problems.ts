// @adr 004 - every error is a registered problem type (BR-23)
//
// The problem catalogue is the backend's i18n-catalogue equivalent: the single
// source a consumer programs against and a frontend translates FROM. An error
// invented at a throw site is a contract change nobody reviewed — error:catalog
// fails an unregistered shape, a duplicate code, and an entry no code can emit.
//
// Responses are RFC 9457 problem+json, always English (the register's §13: the
// backend does not translate; it emits stable codes).

export type ProblemDef = {
  /** Unique kebab-case code; doubles as the docs anchor and the `type` URI tail. */
  code: string;
  status: number;
  /** English, stable; consumers key on `code`, humans read `title`. */
  title: string;
};

/** The catalogue. Keys equal each entry's `code` — consistency enforces it. */
export const problems = {
  "validation-failed": {
    code: "validation-failed",
    status: 400,
    title: "The request does not match the operation's schema",
  },
  "note-not-found": {
    code: "note-not-found",
    status: 404,
    title: "No note exists under this id",
  },
  "route-not-found": {
    code: "route-not-found",
    status: 404,
    title: "No route matches this method and path",
  },
  internal: {
    code: "internal",
    status: 500,
    title: "Unexpected server failure",
  },
} as const satisfies Record<string, ProblemDef>;

export type ProblemCode = keyof typeof problems;

/** The only error type a handler may throw for a client-visible failure. */
export class AppProblem extends Error {
  readonly def: ProblemDef;
  readonly detail: string | undefined;

  constructor(code: ProblemCode, detail?: string) {
    const def = problems[code];
    super(def.title);
    this.name = "AppProblem";
    this.def = def;
    this.detail = detail;
  }

  /** The RFC 9457 body. `type` is a stable relative URI under /problems/. */
  body(instance: string) {
    return {
      type: `/problems/${this.def.code}`,
      title: this.def.title,
      status: this.def.status,
      ...(this.detail === undefined ? {} : { detail: this.detail }),
      instance,
      code: this.def.code,
    };
  }
}
