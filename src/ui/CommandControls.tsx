import { Menu, type MenuItemProps } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { BoundCommand } from "../editor/command";
export function commandProps(command: BoundCommand) {
  return {
    disabled: !command.enabled(),
    onClick: () => {
      command.run();
    },
  };
}
export function CommandMenuItem({
  command,
  ...props
}: { command: BoundCommand } & MenuItemProps) {
  return (
    <Menu.Item {...props} {...commandProps(command)}>
      {command.label}
      {command.shortcut && ` · ${command.shortcut}`}
    </Menu.Item>
  );
}

export function notifyCommand(command: BoundCommand): BoundCommand {
  return {
    ...command,
    run: () => {
      try {
        const message = command.run();
        if (typeof message === "string" && message)
          notifications.show({ message });
      } catch (error) {
        notifications.show({
          color: "red",
          message:
            error instanceof Error
              ? error.message
              : "Could not complete this action.",
        });
      }
    },
  };
}
