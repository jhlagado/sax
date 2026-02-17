; ZAX lowered .asm trace
; range: $0100..$0106 (end exclusive)

; func main begin
main:
ld B, $0001                    ; 0100: 06 01
ld B, $0002                    ; 0102: 06 02
nop                            ; 0104: 00
ret                            ; 0105: C9
; func main end

; symbols:
; label main = $0100
