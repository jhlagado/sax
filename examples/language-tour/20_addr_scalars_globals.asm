; ZAX lowered .asm trace
; range: $0100..$013C (end exclusive)

; func bump_globals begin
bump_globals:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld A, (gbyte)                  ; 010B: 3A 00 00
inc A                          ; 010E: 3C
ld (gbyte), A                  ; 010F: 32 00 00
ld HL, (gword)                 ; 0112: 2A 00 00
inc HL                         ; 0115: 23
ld (gword), HL                 ; 0116: 22 00 00
ld HL, (gword)                 ; 0119: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 011C: D1
pop BC                         ; 011D: C1
pop AF                         ; 011E: F1
ld SP, IX                      ; 011F: DD F9
pop IX                         ; 0121: DD E1
ret                            ; 0123: C9
; func bump_globals end
; func main begin
main:
push IX                        ; 0124: DD E5
ld IX, $0000                   ; 0126: DD 21 00 00
add IX, SP                     ; 012A: DD 39
push AF                        ; 012C: F5
push BC                        ; 012D: C5
push DE                        ; 012E: D5
push HL                        ; 012F: E5
call bump_globals              ; 0130: CD 00 00
__zax_epilogue_1:
pop HL                         ; 0133: E1
pop DE                         ; 0134: D1
pop BC                         ; 0135: C1
pop AF                         ; 0136: F1
ld SP, IX                      ; 0137: DD F9
pop IX                         ; 0139: DD E1
ret                            ; 013B: C9
; func main end

; symbols:
; label bump_globals = $0100
; label __zax_epilogue_0 = $011C
; label main = $0124
; label __zax_epilogue_1 = $0133
; var gbyte = $013C
; var gword = $013D
