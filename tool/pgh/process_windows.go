package main

import (
	"os/exec"
	"strconv"
	"strings"
)

func isProcessAliveWindows(pid int) bool {
	// Use tasklist to check if process exists on Windows
	cmd := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/NH", "/FO", "CSV")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	// If process exists, output will contain the PID
	return strings.Contains(string(output), strconv.Itoa(pid))
}

func buildCommand(command string, args []string) *exec.Cmd {
	cmd := exec.Command(command, args...)
	cmd.SysProcAttr = getSysProcAttr()
	return cmd
}
