//go:build !windows

package main

import (
	"os/exec"
)

func isProcessAliveWindows(pid int) bool {
	// Not used on non-Windows
	return false
}

func buildCommand(command string, args []string) *exec.Cmd {
	cmd := exec.Command(command, args...)
	cmd.SysProcAttr = getSysProcAttr()
	return cmd
}
