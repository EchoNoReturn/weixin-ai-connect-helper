# pgh - Process Helper

后台进程管理工具，支持启动、查看状态、停止后台进程。

## 功能

- **start**: 启动后台进程，写入 pid 文件
- **status**: 扫描 pid 文件，显示进程状态
- **stop**: 停止进程，删除 pid 文件

## 项目结构

```
pgh/
├── go.mod                   # Go 模块定义
├── main.go                  # 主程序逻辑（start/status/stop）
├── process_windows.go       # Windows 进程检测
├── process_other.go         # Unix 进程检测
├── sysprocattr_windows.go   # Windows 进程创建属性
├── sysprocattr_other.go     # Unix 进程创建属性
└── README.md
```

## 使用方法

### 启动进程

```bash
# 启动后台进程（默认以命令名生成 pid 文件）
pgh start ping -t localhost

# 指定 pid 文件路径
pgh start -f my.pid ping -t localhost

# 启用日志记录
pgh start -log pgh.log ping -t localhost
```

### 查看状态

```bash
# 扫描当前目录所有 pid 文件
pgh status

# 指定单个 pid 文件
pgh status -f my.pid

# 启用日志记录
pgh status -log pgh.log
```

### 停止进程

```bash
# 停止当前目录第一个 pid 文件对应的进程
pgh stop

# 停止指定 pid 文件对应的进程
pgh stop -f my.pid

# 停止指定目录下所有 pid 文件对应的进程
pgh stop -a /path/to/dir

# 启用日志记录
pgh stop -log pgh.log
```

## pid 文件格式

JSON 格式，包含进程元信息：

```json
{
  "pid": 12345,
  "command": "ping -t localhost",
  "start_time": "2026-08-01T14:08:04.6469671+08:00"
}
```

## 编译打包

### 本地编译

```bash
# 编译当前平台
go build -o pgh .

# Windows
go build -o pgh.exe .

# Linux/macOS
go build -o pgh .
```

### 交叉编译

```bash
# Windows (64位)
GOOS=windows GOARCH=amd64 go build -o pgh.exe .

# Linux (64位)
GOOS=linux GOARCH=amd64 go build -o pgh .

# macOS (64位)
GOOS=darwin GOARCH=amd64 go build -o pgh .

# macOS (ARM/M1)
GOOS=darwin GOARCH=arm64 go build -o pgh .
```

### 批量打包脚本

```bash
#!/bin/bash
VERSION="1.0.0"

# Windows
GOOS=windows GOARCH=amd64 go build -o pgh-${VERSION}-windows-amd64.exe .

# Linux
GOOS=linux GOARCH=amd64 go build -o pgh-${VERSION}-linux-amd64 .

# macOS
GOOS=darwin GOARCH=amd64 go build -o pgh-${VERSION}-darwin-amd64 .
GOOS=darwin GOARCH=arm64 go build -o pgh-${VERSION}-darwin-arm64 .
```

## 注意事项

- 部分命令（如 Windows `timeout`）需要控制台窗口，无法作为后台进程运行
- `ping`、`python`、`node` 等命令可以正常后台运行
- pid 文件默认生成在当前目录，使用 `-f` 可指定其他路径
- 日志文件通过 `-log` 参数启用，默认不记录
