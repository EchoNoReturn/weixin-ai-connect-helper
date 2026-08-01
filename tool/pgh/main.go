package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type PIDInfo struct {
	PID       int       `json:"pid"`
	Command   string    `json:"command"`
	StartTime time.Time `json:"start_time"`
}

var logger *log.Logger

func initLogger(logFile string) {
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: cannot open log file: %v\n", err)
		return
	}
	logger = log.New(f, "", 0)
}

func logf(format string, args ...interface{}) {
	if logger != nil {
		msg := fmt.Sprintf(format, args...)
		logger.Printf("[%s] %s", time.Now().Format("2006-01-02 15:04:05"), msg)
	}
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "start":
		handleStart(os.Args[2:])
	case "status":
		handleStatus(os.Args[2:])
	case "stop":
		handleStop(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, "Usage: pgh <command> [options] [args]\n\n")
	fmt.Fprintf(os.Stderr, "Commands:\n")
	fmt.Fprintf(os.Stderr, "  start [-f pidfile] [-log logfile] <command> [args...]  Start a background process\n")
	fmt.Fprintf(os.Stderr, "  status [-f pidfile] [-log logfile]                    Show process status\n")
	fmt.Fprintf(os.Stderr, "  stop [-f pidfile | -a dir] [-log logfile]             Stop a background process\n")
}

// ========== start ==========

func handleStart(args []string) {
	fs := flag.NewFlagSet("start", flag.ExitOnError)
	pidFile := fs.String("f", "", "pid file path")
	logFile := fs.String("log", "", "log file path")
	fs.Parse(args)

	if *logFile != "" {
		initLogger(*logFile)
	}

	if fs.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "error: no command specified")
		fmt.Fprintln(os.Stderr, "Usage: pgh start [-f pidfile] [-log logfile] <command> [args...]")
		os.Exit(1)
	}

	command := fs.Arg(0)
	commandArgs := fs.Args()[1:]

	pidFilePath := *pidFile
	if pidFilePath == "" {
		pidFilePath = defaultPIDFilePath(command)
	}

	logf("start command: %s %v", command, commandArgs)
	logf("pid file: %s", pidFilePath)

	// Check if already running
	if info, err := readPIDFile(pidFilePath); err == nil {
		if isProcessAlive(info.PID) {
			logf("process already running (pid %d)", info.PID)
			fmt.Fprintf(os.Stderr, "error: process already running (pid %d, file: %s)\n", info.PID, pidFilePath)
			os.Exit(1)
		}
		// Stale pid file, remove it
		logf("removing stale pid file (old pid %d)", info.PID)
		os.Remove(pidFilePath)
	}

	// Build the full command for display
	fullCommand := command
	if len(commandArgs) > 0 {
		fullCommand = command + " " + strings.Join(commandArgs, " ")
	}

	// Start the background process
	cmd := buildCommand(command, commandArgs)
	if err := cmd.Start(); err != nil {
		logf("error starting process: %v", err)
		fmt.Fprintf(os.Stderr, "error starting process: %v\n", err)
		os.Exit(1)
	}

	// Write pid file
	info := PIDInfo{
		PID:       cmd.Process.Pid,
		Command:   fullCommand,
		StartTime: time.Now(),
	}
	if err := writePIDFile(pidFilePath, info); err != nil {
		logf("error writing pid file: %v", err)
		fmt.Fprintf(os.Stderr, "error writing pid file: %v\n", err)
		// Try to kill the process we just started
		cmd.Process.Kill()
		os.Exit(1)
	}

	logf("started process %d (%s)", info.PID, fullCommand)
	fmt.Printf("started process %d (%s)\n", info.PID, fullCommand)
	fmt.Printf("pid file: %s\n", pidFilePath)
}

// ========== status ==========

func handleStatus(args []string) {
	fs := flag.NewFlagSet("status", flag.ExitOnError)
	pidFile := fs.String("f", "", "specific pid file to check")
	logFile := fs.String("log", "", "log file path")
	fs.Parse(args)

	if *logFile != "" {
		initLogger(*logFile)
	}

	logf("status command")

	if *pidFile != "" {
		// Check single pid file
		showStatus(*pidFile)
		return
	}

	// Scan current directory for pid files
	pidFiles, err := findPIDFiles(".")
	if err != nil {
		logf("error scanning directory: %v", err)
		fmt.Fprintf(os.Stderr, "error scanning directory: %v\n", err)
		os.Exit(1)
	}

	if len(pidFiles) == 0 {
		logf("no pid files found")
		fmt.Println("no pid files found in current directory")
		return
	}

	// Group by directory
	grouped := groupByDirectory(pidFiles)
	for dir, files := range grouped {
		if dir != "." {
			fmt.Printf("\n[%s]\n", dir)
		}
		for _, f := range files {
			showStatus(f)
		}
	}
}

func showStatus(pidFilePath string) {
	info, err := readPIDFile(pidFilePath)
	if err != nil {
		logf("invalid pid file %s: %v", pidFilePath, err)
		fmt.Printf("%-30s  [invalid pid file: %v]\n", filepath.Base(pidFilePath), err)
		return
	}

	alive := isProcessAlive(info.PID)
	status := "stopped"
	if alive {
		status = "running"
	}

	logf("status check: %s pid=%d status=%s", filepath.Base(pidFilePath), info.PID, status)

	elapsed := time.Since(info.StartTime).Truncate(time.Second)
	fmt.Printf("%-30s  pid=%-7d  status=%-8s  uptime=%-12s  cmd=%s\n",
		filepath.Base(pidFilePath),
		info.PID,
		status,
		elapsed,
		info.Command,
	)
}

// ========== stop ==========

func handleStop(args []string) {
	fs := flag.NewFlagSet("stop", flag.ExitOnError)
	pidFile := fs.String("f", "", "specific pid file")
	allDir := fs.String("a", "", "stop all processes in directory")
	logFile := fs.String("log", "", "log file path")
	fs.Parse(args)

	if *logFile != "" {
		initLogger(*logFile)
	}

	logf("stop command")

	if *allDir != "" {
		stopAll(*allDir)
		return
	}

	if *pidFile != "" {
		stopOne(*pidFile)
		return
	}

	// Default: stop first pid file found in current directory
	pidFiles, err := findPIDFiles(".")
	if err != nil {
		logf("error scanning directory: %v", err)
		fmt.Fprintf(os.Stderr, "error scanning directory: %v\n", err)
		os.Exit(1)
	}

	if len(pidFiles) == 0 {
		logf("no pid files found")
		fmt.Fprintln(os.Stderr, "no pid files found in current directory")
		os.Exit(1)
	}

	stopOne(pidFiles[0])
}

func stopOne(pidFilePath string) {
	info, err := readPIDFile(pidFilePath)
	if err != nil {
		logf("error reading pid file %s: %v", pidFilePath, err)
		fmt.Fprintf(os.Stderr, "error reading pid file %s: %v\n", pidFilePath, err)
		os.Exit(1)
	}

	if !isProcessAlive(info.PID) {
		logf("process %d is not running, cleaning up pid file", info.PID)
		fmt.Printf("process %d is not running, cleaning up pid file\n", info.PID)
		os.Remove(pidFilePath)
		return
	}

	logf("stopping process %d (%s)", info.PID, info.Command)
	if err := killProcess(info.PID); err != nil {
		logf("error stopping process %d: %v", info.PID, err)
		fmt.Fprintf(os.Stderr, "error stopping process %d: %v\n", info.PID, err)
		os.Exit(1)
	}

	// Wait briefly for process to exit
	for i := 0; i < 20; i++ {
		if !isProcessAlive(info.PID) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	os.Remove(pidFilePath)
	logf("stopped process %d (%s)", info.PID, info.Command)
	fmt.Printf("stopped process %d (%s)\n", info.PID, info.Command)
}

func stopAll(dir string) {
	pidFiles, err := findPIDFiles(dir)
	if err != nil {
		logf("error scanning directory: %v", err)
		fmt.Fprintf(os.Stderr, "error scanning directory: %v\n", err)
		os.Exit(1)
	}

	if len(pidFiles) == 0 {
		logf("no pid files found in %s", dir)
		fmt.Printf("no pid files found in %s\n", dir)
		return
	}

	for _, f := range pidFiles {
		stopOne(f)
	}
}

// ========== pid file helpers ==========

func defaultPIDFilePath(command string) string {
	base := filepath.Base(command)
	// Remove extension on Windows
	if ext := filepath.Ext(base); ext != "" {
		base = strings.TrimSuffix(base, ext)
	}
	return base + ".pid"
}

func readPIDFile(path string) (PIDInfo, error) {
	var info PIDInfo
	data, err := os.ReadFile(path)
	if err != nil {
		return info, err
	}
	err = json.Unmarshal(data, &info)
	return info, err
}

func writePIDFile(path string, info PIDInfo) error {
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func findPIDFiles(dir string) ([]string, error) {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(absDir)
	if err != nil {
		return nil, err
	}

	var pidFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(entry.Name(), ".pid") {
			pidFiles = append(pidFiles, filepath.Join(absDir, entry.Name()))
		}
	}

	// Sort for consistent ordering
	sortStrings(pidFiles)
	return pidFiles, nil
}

func groupByDirectory(files []string) map[string][]string {
	grouped := make(map[string][]string)
	for _, f := range files {
		dir := filepath.Dir(f)
		grouped[dir] = append(grouped[dir], f)
	}
	return grouped
}

// ========== process helpers ==========

func isProcessAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// On Unix, FindProcess always succeeds; need to send signal 0
	// On Windows, FindProcess fails if process doesn't exist
	err = proc.Signal(syscall.Signal(0))
	if err == nil {
		return true
	}

	// Fallback: try to open process on Windows
	return isProcessAliveWindows(pid)
}

func killProcess(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("process %d not found", pid)
	}
	return proc.Kill()
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

func parsePID(s string) (int, error) {
	return strconv.Atoi(strings.TrimSpace(s))
}
