package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import net.mrchar.corn.model.base.AuditableEntity;
import net.mrchar.corn.model.element.Label;

import java.util.Set;

@Getter
@Setter
@Entity
@Table(name = "recorder")
public class Recorder extends AuditableEntity {
    @ManyToOne
    @JoinColumn(name = "category")
    private Category category;

    @ElementCollection
    @CollectionTable(name = "recorder_budget_label")
    private Set<Label> budgetLabels;

    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @ManyToOne
    @JoinColumn(name = "action_id")
    private Action action;

    @ElementCollection
    @CollectionTable(name = "recorder_action_label")
    private Set<Label> actionLabels;

    @Column(name = "config", columnDefinition = "LONGTEXT")
    private String config;
}
