; ZAX lowered .asm trace
; range: $0100..$0159 (end exclusive)

; func inc_one begin
inc_one:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, $0000                   ; 010B: 21 00 00
push HL                        ; 010E: E5
ld HL, $0064                   ; 010F: 21 64 00
push HL                        ; 0112: E5
ld E, (IX + $0004)             ; 0113: DD 5E 04
ld D, (IX + $0005)             ; 0116: DD 56 05
inc DE                         ; 0119: 13
ld (IX - $0008), E             ; 011A: DD 73 F8
ld (IX - $0007), D             ; 011D: DD 72 F9
ld E, (IX - $0008)             ; 0120: DD 5E F8
ld D, (IX - $0007)             ; 0123: DD 56 F9
ex DE, HL                      ; 0126: EB
__zax_epilogue_0:
pop DE                         ; 0127: D1
pop BC                         ; 0128: C1
pop AF                         ; 0129: F1
ld SP, IX                      ; 012A: DD F9
pop IX                         ; 012C: DD E1
ret                            ; 012E: C9
; func inc_one end
; func main begin
main:
push IX                        ; 012F: DD E5
ld IX, $0000                   ; 0131: DD 21 00 00
add IX, SP                     ; 0135: DD 39
push AF                        ; 0137: F5
push BC                        ; 0138: C5
push DE                        ; 0139: D5
ld HL, $0000                   ; 013A: 21 00 00
push HL                        ; 013D: E5
ld HL, $0005                   ; 013E: 21 05 00
push HL                        ; 0141: E5
call inc_one                   ; 0142: CD 00 00
inc SP                         ; 0145: 33
inc SP                         ; 0146: 33
push DE                        ; 0147: D5
ex DE, HL                      ; 0148: EB
ld (IX - $0008), E             ; 0149: DD 73 F8
ld (IX - $0007), D             ; 014C: DD 72 F9
ex DE, HL                      ; 014F: EB
pop DE                         ; 0150: D1
__zax_epilogue_1:
pop DE                         ; 0151: D1
pop BC                         ; 0152: C1
pop AF                         ; 0153: F1
ld SP, IX                      ; 0154: DD F9
pop IX                         ; 0156: DD E1
ret                            ; 0158: C9
; func main end

; symbols:
; label inc_one = $0100
; label __zax_epilogue_0 = $0127
; label main = $012F
; label __zax_epilogue_1 = $0151
