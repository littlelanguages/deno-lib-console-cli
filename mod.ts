import {
  text,
  render,
  vcat,
  nest,
  empty,
  Doc,
  punctuate,
  hcat,
} from "https://raw.githubusercontent.com/littlelanguages/deno-lib-text-prettyprint/0.0.1/mod.ts";

export type Definition = {
  name: string;
  help: string;
  options: Array<Option>;
  cmds: Array<Command>;
};

export function process(cli: Definition): void {
  const values = new Map<string, undefined>();
  const args = [...Deno.args];

  processOptions(cli, cli.options, args, values);

  if (args.length == 0) {
    reportErrorAndTerminate("Invalid arguments - no command specified", cli);
  } else {
    const cmd = cli.cmds.find((c) => c.canDo(args));

    if (cmd == undefined) {
      reportErrorAndTerminate(`Invalid command ${args[0]}`, cli);
    } else {
      args.splice(0, 1);
      cmd.doNow(cli, args, values);
    }
  }
}

export abstract class Option {
  abstract show(): Doc;
  abstract canDo(args: Array<string>): boolean;
  abstract doNow(
    cli: Definition,
    args: Array<string>,
    values: Map<string, undefined>,
  ): Promise<void>;
}

export class ValueOption extends Option {
  private tags: Array<string>;
  private help: string;

  constructor(
    tags: Array<string>,
    help: string,
  ) {
    super();
    this.tags = tags;
    this.help = help;
  }

  show(): Doc {
    return vcat([
      hcat(
        punctuate(text(", "), this.tags.map((t) => text(t).p(text("=Value")))),
      ),
      nest(4, text(this.help)),
    ]);
  }

  canDo(args: Array<string>): boolean {
    return this.tags.some((t) => args[0].startsWith(t + "="));
  }

  doNow(
    _: Definition,
    args: Array<string>,
    values: Map<string, unknown>,
  ): Promise<void> {
    const value = args[0];
    const indexOfEqual = value.indexOf("=");

    values.set(
      dropWhile(this.tags[0], (c) => c == "-"),
      value.substring(indexOfEqual + 1),
    );
    args.splice(0, 1);

    return Promise.resolve();
  }
}

function dropWhile(s: string, p: (s: string) => boolean): string {
  let index = 0;

  while (index < s.length) {
    if (p(s.substring(index, index + 1))) {
      index += 1;
    } else {
      break;
    }
  }

  return (index == 0) ? s : s.substring(index);
}

export class FlagOption extends Option {
  private tags: Array<string>;
  private help: string;

  constructor(
    tags: Array<string>,
    help: string,
  ) {
    super();
    this.tags = tags;
    this.help = help;
  }

  show(): Doc {
    return vcat([
      hcat(punctuate(text(", "), this.tags.map(text))),
      nest(4, text(this.help)),
    ]);
  }

  canDo(args: Array<string>): boolean {
    return this.tags.some((t) => t == args[0]);
  }

  doNow(
    _: Definition,
    args: Array<string>,
    values: Map<string, unknown>,
  ): Promise<void> {
    args.splice(0, 1);
    values.set(dropWhile(this.tags[0], (c) => c == "-"), true);
    return Promise.resolve();
  }
}

export class DoOption extends Option {
  private tags: Array<string>;
  private help: string;
  private action: (
    cli: Definition,
    args: Array<string>,
    values: Map<string, undefined>,
  ) => void;

  constructor(
    tags: Array<string>,
    help: string,
    action: (
      cli: Definition,
      args: Array<string>,
      values: Map<string, undefined>,
    ) => Promise<void>,
  ) {
    super();
    this.tags = tags;
    this.help = help;
    this.action = action;
  }

  show(): Doc {
    return vcat([
      hcat(punctuate(text(", "), this.tags.map(text))),
      nest(4, text(this.help)),
    ]);
  }

  canDo(args: Array<string>): boolean {
    return this.tags.some((t) => t == args[0]);
  }

  doNow(
    cli: Definition,
    args: Array<string>,
    values: Map<string, undefined>,
  ): Promise<void> {
    args.splice(0, 1);
    this.action(cli, args, values);
    return Promise.resolve();
  }
}

function reportErrorAndTerminate(errorMsg: string, cli: Definition): void {
  console.log(`Error: ${errorMsg}`);
  Deno.exit(-1);
}

function show(cli: Definition): Promise<void> {
  return render(
    vcat([
      text(cli.help),
      text(""),
      text("USAGE:"),
      nest(
        4,
        text(cli.name)
          .pp((cli.options.length == 0) ? empty : text("{OPTION}"))
          .pp((cli.cmds.length == 0) ? empty : text("[COMMAND]")),
      ),
      (cli.options.length == 0) ? empty : vcat(
        [
          text(""),
          text("OPTION:"),
          nest(4, vcat(cli.options.flatMap((o) => o.show()))),
        ],
      ),
      (cli.cmds.length == 0) ? empty : vcat(
        [
          text(""),
          text("COMMAND:"),
          nest(
            4,
            vcat(
              cli.cmds.flatMap((cmd) =>
                text(cmd.name).p(nest(20, text(cmd.help)))
              ),
            ),
          ),
        ],
      ),
    ]),
    Deno.stdout,
  );
}

export const helpFlag = new DoOption(
  ["-h", "--help"],
  "Prints help information",
  async (cli) => {
    await show(cli);
    Deno.exit(0);
  },
);

type ShowValue = {
  name: string;
  optional: boolean;
  help: string;
};

export abstract class Command {
  name: string;
  help: string;
  options: Array<Option>;

  constructor(name: string, help: string, options: Array<Option>) {
    this.name = name;
    this.help = help;
    this.options = options;
  }

  abstract canDo(args: Array<string>): boolean;

  abstract doNow(
    cli: Definition,
    args: Array<string>,
    values: Map<string, undefined>,
  ): void;

  abstract show(): Doc;
}

function processOptions(
  cli: Definition,
  options: Array<Option>,
  args: Array<string>,
  values: Map<string, undefined>,
): void {
  while (args.length > 0 && args[0].startsWith("-")) {
    if (args[0] == "--") {
      args.splice(0, 1);
      break;
    }

    const option = options.find((o) => o.canDo(args));

    if (option == undefined) {
      reportErrorAndTerminate(`Invalid option ${args[0]}`, cli);
    } else {
      option.doNow(cli, args, values);
    }
  }
}

export class ValueCommand extends Command {
  showValue: ShowValue;
  private action: (
    cli: Definition,
    file: string | undefined,
    options: Map<string, unknown>,
  ) => void;

  constructor(
    name: string,
    help: string,
    options: Array<Option>,
    showValue: ShowValue,
    action: (
      cli: Definition,
      file: string | undefined,
      options: Map<string, unknown>,
    ) => void,
  ) {
    super(name, help, options);
    this.showValue = showValue;
    this.action = action;
  }

  canDo(args: Array<string>) {
    return (args.length > 0 && args[0] == this.name);
  }

  doNow(
    cli: Definition,
    args: Array<string>,
    values: Map<string, undefined>,
  ): void {
    processOptions(cli, this.options, args, values);

    if (args.length == 0) {
      if (this.showValue.optional) {
        this.action(cli, undefined, values);
      } else {
        reportErrorAndTerminate(`${this.showValue.name} requires a value`, cli);
      }
    } else if (args.length == 1) {
      this.action(cli, args[0], values);
    } else {
      reportErrorAndTerminate(`Too many arguments ${args}`, cli);
    }
  }

  show(): Doc {
    const usageName = this.showValue.optional
      ? `[${this.showValue.name}]`
      : this.showValue.name;

    return vcat([
      text("USAGE:"),
      nest(
        4,
        text(this.name).pp(
          (this.options.length == 0) ? empty : text("{OPTION}"),
        ).pp(text(usageName)),
      ),
      (this.options.length == 0) ? empty : vcat(
        [
          text(""),
          text("OPTION:"),
          nest(4, vcat(this.options.flatMap((o) => o.show()))),
        ],
      ),
      text(""),
      text(this.showValue.name),
      nest(4, text(this.showValue.help)),
    ]);
  }
}

export const helpCmd = new ValueCommand(
  "help",
  "Provides detail help on a specific command",
  [],
  {
    name: "CmdName",
    optional: true,
    help: "The name of the command that more help detail is to be shown.",
  },
  (
    cli: Definition,
    value: string | undefined,
    _: Map<String, unknown>,
  ) => {
    if (value == undefined) {
      show(cli);
    } else {
      const cmd = cli.cmds.find((c) => c.name == value);

      if (cmd == null) {
        reportErrorAndTerminate(`Unknown command ${value}`, cli);
      } else {
        render(cmd.show(), Deno.stdout);
      }
    }
  },
);