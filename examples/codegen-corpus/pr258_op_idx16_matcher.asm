; ZAX lowered .asm trace
; range: $0100..$0107 (end exclusive)

; func main begin
main:
ld A, (IX + $0002)             ; 0100: DD 7E 02
ld B, (IY)                     ; 0103: FD 46 00
ret                            ; 0106: C9
; func main end

; symbols:
; label main = $0100
