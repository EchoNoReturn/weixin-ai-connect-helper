package main

import "syscall"

const (
	_DETACHED_PROCESS  = 0x00000008
	_CREATE_NO_WINDOW  = 0x08000000
)

func getSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | _DETACHED_PROCESS | _CREATE_NO_WINDOW,
	}
}
