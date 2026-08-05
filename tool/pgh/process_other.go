//go:build !windows

package main

import (
	"os/exec"
	"strings"
)

func isProcessAliveWindows(pid int) bool {
	// Not used on non-Windows
	return false
}

func buildCommand(command string, args []string) *exec.Cmd {
	// Use /bin/sh as intermediate layer to avoid Bun fd inheritance issues
	// when Go fork+setsid creates daemon process
	fullCmd := command
	if len(args) > 0 {
		fullCmd += " " + strings.Join(args, " ")
	}
	cmd := exec.Command("/bin/sh", "-c", fullCmd)
	cmd.SysProcAttr = getSysProcAttr()
	return cmd
}
